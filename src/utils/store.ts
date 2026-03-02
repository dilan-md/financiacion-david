export interface Transaction {
    id: string;
    type: 'expense' | 'income';
    amount: number;
    category: string;
    date: string;
    note: string;
    timestamp: number;
    goalId?: string;
}

const TRANSACTIONS_KEY = 'vibrant_transactions';

export const getTransactions = (): Transaction[] => {
    if (typeof window === 'undefined') return [];

    const data = localStorage.getItem(TRANSACTIONS_KEY);
    if (!data) return [];

    try {
        const parsed = JSON.parse(data);
        console.log(`[Store] Loaded ${parsed.length} transactions from localStorage`);
        return parsed;
    } catch (e) {
        console.error("Error parsing transactions from local storage", e);
        return [];
    }
};

export const addTransaction = (transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
    if (typeof window === 'undefined') return;

    const transactions = getTransactions();
    const newTransaction: Transaction = {
        ...transaction,
        id: crypto.randomUUID(),
        timestamp: Date.now()
    };

    transactions.push(newTransaction);
    // Sort descending by date, then timestamp
    transactions.sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return b.timestamp - a.timestamp;
    });

    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    console.log(`[Store] Saved transaction. Total: ${transactions.length}`);

    // Dispatch an event so components can update reactively
    window.dispatchEvent(new CustomEvent('transactions-updated'));
};

export const updateTransaction = (id: string, updatedData: Partial<Transaction>) => {
    if (typeof window === 'undefined') return;

    const transactions = getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index === -1) return;

    const oldTransaction = transactions[index];
    const newTransaction = { ...oldTransaction, ...updatedData };
    transactions[index] = newTransaction;

    // Handle Goal Sync
    const goals = getGoals();
    let goalsChanged = false;

    // Case 1: Was savings, no longer savings OR amount changed
    if (oldTransaction.category === 'savings' && oldTransaction.goalId) {
        const goalIndex = goals.findIndex(g => g.id === oldTransaction.goalId);
        if (goalIndex !== -1) {
            if (newTransaction.category !== 'savings') {
                // No longer savings, remove old amount
                goals[goalIndex].current -= oldTransaction.amount;
                // Important: also remove the goalId from the transaction since it's no longer linked
                newTransaction.goalId = undefined;
            } else {
                // Still savings, just adjust amount
                goals[goalIndex].current = goals[goalIndex].current - oldTransaction.amount + newTransaction.amount;
            }
            goalsChanged = true;
        }
    }
    // Case 2: Was NOT savings, but now it IS savings (This is rare from UI but good for robustness)
    // Note: This would requires a goalId we don't have, so we mostly handle Case 1.

    if (goalsChanged) {
        localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
        window.dispatchEvent(new CustomEvent('goals-updated'));
    }

    // Re-sort
    transactions.sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return b.timestamp - a.timestamp;
    });

    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    window.dispatchEvent(new CustomEvent('transactions-updated'));
};

export const deleteTransaction = (id: string) => {
    if (typeof window === 'undefined') return;

    const transactions = getTransactions();
    const transactionToDelete = transactions.find(t => t.id === id);

    if (transactionToDelete && transactionToDelete.category === 'savings' && transactionToDelete.goalId) {
        const goals = getGoals();
        const goalIndex = goals.findIndex(g => g.id === transactionToDelete.goalId);
        if (goalIndex !== -1) {
            goals[goalIndex].current -= transactionToDelete.amount;
            localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
            window.dispatchEvent(new CustomEvent('goals-updated'));
        }
    }

    const filtered = transactions.filter(t => t.id !== id);

    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('transactions-updated'));
};

export function resetGoalProgress() {
    if (typeof window === 'undefined') return;
    const goals = getGoals();
    goals.forEach(g => (g.current = 0));
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent('goals-updated'));
}

export function clearAllTransactions() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TRANSACTIONS_KEY);
    // When clearing all transactions, we also reset goal progress to maintain flow
    resetGoalProgress();
    window.dispatchEvent(new CustomEvent('transactions-updated'));
}

export function resetAllData() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TRANSACTIONS_KEY);
    localStorage.removeItem(GOALS_KEY);
    localStorage.removeItem(BUDGETS_KEY);
    window.dispatchEvent(new CustomEvent('transactions-updated'));
    window.dispatchEvent(new CustomEvent('goals-updated'));
    window.dispatchEvent(new CustomEvent('budgets-updated'));
}

// Goals
const GOALS_KEY = 'vibrant_ledger_goals';
export interface Goal {
    id: string;
    name: string;
    amount: number;
    date: string;
    icon: string;
    current: number;
}

export function getGoals(): Goal[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(GOALS_KEY);
    return data ? JSON.parse(data) : [];
}

export function addGoal(goal: Omit<Goal, 'id' | 'current'>) {
    if (typeof window === 'undefined') return;
    const goals = getGoals();
    const newGoal = {
        ...goal,
        id: crypto.randomUUID(),
        current: 0
    };
    goals.push(newGoal);
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent('goals-updated'));
}

export function updateGoal(id: string, updatedData: Partial<Goal>) {
    if (typeof window === 'undefined') return;
    const goals = getGoals();
    const index = goals.findIndex(g => g.id === id);
    if (index === -1) return;

    goals[index] = { ...goals[index], ...updatedData };
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent('goals-updated'));
}

export function deleteGoal(id: string) {
    if (typeof window === 'undefined') return;
    const goals = getGoals();
    const filtered = goals.filter(g => g.id !== id);
    localStorage.setItem(GOALS_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('goals-updated'));
}

export function getSavingsTotal(): number {
    const goals = getGoals();
    return goals.reduce((sum, goal) => sum + goal.current, 0);
}

export function updateGoalProgress(goalId: string, amount: number) {
    if (typeof window === 'undefined') return;

    const goals = getGoals();
    const goalIndex = goals.findIndex(g => g.id === goalId);

    if (goalIndex === -1) return;

    goals[goalIndex].current += amount;
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));

    // Create a corresponding transaction
    addTransaction({
        type: 'expense',
        amount: amount,
        category: 'savings',
        goalId: goalId,
        note: `Funded goal: ${goals[goalIndex].name}`,
        date: new Date().toISOString().split('T')[0]
    });

    window.dispatchEvent(new CustomEvent('goals-updated'));
}

// Budgets
const BUDGETS_KEY = 'vibrant_ledger_budgets';
export type Budgets = Record<string, number>;

export function getBudgets(): Budgets {
    if (typeof window === 'undefined') return {};
    const data = localStorage.getItem(BUDGETS_KEY);
    return data ? JSON.parse(data) : {
        'dining': 800,
        'shopping': 900,
        'transportation': 300,
        'entertainment': 200
    };
}

export function saveBudgets(budgets: Budgets) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets));
    window.dispatchEvent(new CustomEvent('budgets-updated'));
}

export const getBalanceOverview = () => {
    const transactions = getTransactions();

    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(t => {
        if (t.type === 'income') {
            totalIncome += t.amount;
        } else if (t.type === 'expense') {
            totalExpense += t.amount;
        }
    });

    return {
        totalIncome,
        totalExpense,
        totalBalance: totalIncome - totalExpense
    };
};

export const getMonthGrowthRate = () => {
    const transactions = getTransactions();
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    let balanceBeforeThisMonth = 0;
    let netThisMonth = 0;

    transactions.forEach(t => {
        const tDate = parseLocalDate(t.date);
        const amount = t.type === 'income' ? t.amount : -t.amount;

        if (tDate.getFullYear() < thisYear || (tDate.getFullYear() === thisYear && tDate.getMonth() < thisMonth)) {
            balanceBeforeThisMonth += amount;
        } else if (tDate.getFullYear() === thisYear && tDate.getMonth() === thisMonth) {
            netThisMonth += amount;
        }
    });

    if (balanceBeforeThisMonth === 0) {
        // If no previous balance, show growth relative to income this month
        // or just return 0 if there's no data
        return netThisMonth > 0 ? 100 : 0;
    }

    return (netThisMonth / Math.abs(balanceBeforeThisMonth)) * 100;
};

// --- Formatters & Helpers ---
export const parseLocalDate = (dateStr: string) => {
    // Split YYYY-MM-DD and create date in local time
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(amount);
};
