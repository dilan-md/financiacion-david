import { supabase } from '../lib/supabase';

export interface Transaction {
    id: string;
    type: 'expense' | 'income';
    amount: number;
    category: string;
    date: string;
    note: string;
    timestamp: number;
    goalId?: string;
    user_id?: string;
}

export interface Goal {
    id: string;
    name: string;
    amount: number;
    date: string;
    icon: string;
    current: number;
    notes?: string;
    user_id?: string;
}

export type Budgets = Record<string, number>;

// --- Auth Functions ---

export async function isUserAdmin(): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;
    // For now we check against a list of admin emails or a specific one
    // In a real app, this would be a role in the DB
    const adminEmails = ['florezramirezronaldo@gmail.com', 'david@example.com', 'dilan@example.com'];
    return adminEmails.includes(user.email || '');
}

export const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

export const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
};

// --- Transaction Functions ---

export const getTransactions = async (): Promise<Transaction[]> => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    return data || [];
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase
        .from('transactions')
        .insert([{
            ...transaction,
            user_id: user.id,
            timestamp: Date.now()
        }]);

    if (error) console.error('Error adding transaction:', error);
    window.dispatchEvent(new CustomEvent('transactions-updated'));
};

export const updateTransaction = async (id: string, updatedData: Partial<Transaction>) => {
    const { error } = await supabase
        .from('transactions')
        .update(updatedData)
        .eq('id', id);

    if (error) console.error('Error updating transaction:', error);

    // We handle goal sync differently in Supabase if needed, 
    // but for now let's just trigger the event.
    window.dispatchEvent(new CustomEvent('transactions-updated'));
    window.dispatchEvent(new CustomEvent('goals-updated'));
};

export const deleteTransaction = async (id: string) => {
    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

    if (error) console.error('Error deleting transaction:', error);
    window.dispatchEvent(new CustomEvent('transactions-updated'));
    window.dispatchEvent(new CustomEvent('goals-updated'));
};

// --- Goal Functions ---

export const getGoals = async (): Promise<Goal[]> => {
    const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching goals:', error);
        return [];
    }
    return data || [];
};

export const addGoal = async (goal: Omit<Goal, 'id' | 'current'>) => {
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase
        .from('goals')
        .insert([{
            ...goal,
            user_id: user.id,
            current: 0
        }]);

    if (error) console.error('Error adding goal:', error);
    window.dispatchEvent(new CustomEvent('goals-updated'));
};

export const updateGoal = async (id: string, updatedData: Partial<Goal>) => {
    const { error } = await supabase
        .from('goals')
        .update(updatedData)
        .eq('id', id);

    if (error) console.error('Error updating goal:', error);
    window.dispatchEvent(new CustomEvent('goals-updated'));
};

export const deleteGoal = async (id: string) => {
    const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id);

    if (error) console.error('Error deleting goal:', error);
    window.dispatchEvent(new CustomEvent('goals-updated'));
};

export const updateGoalProgress = async (goalId: string, amount: number) => {
    const goals = await getGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const newCurrent = goal.current + amount;

    const { error } = await supabase
        .from('goals')
        .update({ current: newCurrent })
        .eq('id', goalId);

    if (error) {
        console.error('Error updating goal progress:', error);
        return;
    }

    // Create a corresponding transaction
    await addTransaction({
        type: 'expense',
        amount: amount,
        category: 'savings',
        goalId: goalId,
        note: `Funded goal: ${goal.name}`,
        date: new Date().toISOString().split('T')[0]
    });

    window.dispatchEvent(new CustomEvent('goals-updated'));
};

export const getSavingsTotal = async (): Promise<number> => {
    const goals = await getGoals();
    return goals.reduce((sum, goal) => sum + goal.current, 0);
};

// --- Budget Functions ---

export const getBudgets = async (): Promise<Budgets> => {
    const { data, error } = await supabase
        .from('budgets')
        .select('category, limit');

    if (error) {
        console.error('Error fetching budgets:', error);
        return {
            'dining': 800,
            'shopping': 900,
            'transportation': 300,
            'entertainment': 200
        };
    }

    const budgets: Budgets = {};
    data?.forEach(b => {
        budgets[b.category] = b.limit;
    });

    if (Object.keys(budgets).length === 0) {
        return {
            'dining': 800,
            'shopping': 900,
            'transportation': 300,
            'entertainment': 200
        };
    }

    return budgets;
};

export const saveBudgets = async (budgets: Budgets) => {
    const user = await getCurrentUser();
    if (!user) return;

    for (const [category, limit] of Object.entries(budgets)) {
        await supabase
            .from('budgets')
            .upsert({
                user_id: user.id,
                category,
                limit
            }, { onConflict: 'user_id,category' });
    }

    window.dispatchEvent(new CustomEvent('budgets-updated'));
};

// --- Analysis Functions ---

export const getBalanceOverview = async () => {
    const transactions = await getTransactions();

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

export const getMonthGrowthRate = async () => {
    const transactions = await getTransactions();
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

    const isNewAccount = balanceBeforeThisMonth === 0;

    if (isNewAccount) {
        // For new accounts, the "growth" isn't meaningful relative to 0
        // We return the net amount itself as a pseudo-rate for UI display
        return {
            rate: netThisMonth > 0 ? 100 : 0,
            isNewAccount: true,
            netThisMonth
        };
    }

    return {
        rate: (netThisMonth / Math.abs(balanceBeforeThisMonth)) * 100,
        isNewAccount: false,
        netThisMonth
    };
};

// --- Reset Functions ---

export const resetAllData = async () => {
    const user = await getCurrentUser();
    if (!user) return;

    await supabase.from('transactions').delete().eq('user_id', user.id);
    await supabase.from('goals').delete().eq('user_id', user.id);
    await supabase.from('budgets').delete().eq('user_id', user.id);

    window.dispatchEvent(new CustomEvent('transactions-updated'));
    window.dispatchEvent(new CustomEvent('goals-updated'));
    window.dispatchEvent(new CustomEvent('budgets-updated'));
};

// --- Helpers ---

export const parseLocalDate = (dateStr: string) => {
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
