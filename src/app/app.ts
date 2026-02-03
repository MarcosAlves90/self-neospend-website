import { Component, computed, effect, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly storageKey = 'neospend-transactions';
  protected readonly categories = [
    'Salário',
    'Freelance',
    'Casa',
    'Mobilidade',
    'Alimentação',
    'Investimentos',
    'Saúde',
    'Lazer'
  ];

  protected readonly filterCategory = signal('Todas');
  protected readonly filterMonth = signal('Todos');
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly valueText = signal('');
  protected readonly category = signal(this.categories[0]);
  protected readonly transactions = signal<Transaction[]>([]);

  protected readonly incomeTotal = computed(() =>
    this.transactions()
      .filter((tx) => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0)
  );

  protected readonly expenseTotal = computed(() =>
    this.transactions()
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  );

  protected readonly balanceTotal = computed(() =>
    this.transactions().reduce((sum, tx) => sum + tx.amount, 0)
  );

  protected readonly expenseProgress = computed(() => {
    const income = this.incomeTotal();
    const expense = this.expenseTotal();
    if (income <= 0) {
      return expense > 0 ? 100 : 0;
    }
    return Math.min(100, (expense / income) * 100);
  });

  protected readonly monthOptions = computed(() => {
    const months = new Set(
      this.transactions().map((tx) => this.getMonthKey(tx.createdAt))
    );
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  });

  protected readonly filteredTransactions = computed(() => {
    const category = this.filterCategory();
    const month = this.filterMonth();

    return this.transactions().filter((tx) => {
      const categoryMatch = category === 'Todas' || tx.category === category;
      const monthMatch = month === 'Todos' || this.getMonthKey(tx.createdAt) === month;
      return categoryMatch && monthMatch;
    });
  });

  protected readonly expenseBreakdown = computed(() => {
    const totals = new Map<string, number>();
    this.transactions()
      .filter((tx) => tx.amount < 0)
      .forEach((tx) => {
        const current = totals.get(tx.category) ?? 0;
        totals.set(tx.category, current + Math.abs(tx.amount));
      });

    const totalExpense = this.expenseTotal();
    const breakdown = Array.from(totals.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpense ? Math.round((amount / totalExpense) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return breakdown;
  });

  protected readonly donutGradient = computed(() => {
    const breakdown = this.expenseBreakdown();
    if (breakdown.length === 0) {
      return 'conic-gradient(rgba(82, 255, 106, 0.2) 0deg, rgba(82, 255, 106, 0.2) 360deg)';
    }

    const colors = [
      '#52ff6a',
      '#36d9ff',
      '#ffd166',
      '#ff5a6a',
      '#9b8cff',
      '#42f5c2'
    ];

    let current = 0;
    const slices = breakdown.map((item, index) => {
      const angle = (item.percentage / 100) * 360;
      const start = current;
      const end = current + angle;
      current = end;
      return `${colors[index % colors.length]} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${slices.join(', ')})`;
  });

  protected readonly isEditing = computed(() => this.editingId() !== null);

  constructor() {
    const stored = this.readFromStorage();
    if (stored.length > 0) {
      this.transactions.set(stored);
    }

    effect(() => {
      this.writeToStorage(this.transactions());
    });
  }

  protected addTransaction(event: Event) {
    event.preventDefault();

    const trimmedName = this.name().trim();
    const amount = this.parseAmount(this.valueText());

    if (!trimmedName || !amount) {
      return;
    }

    const editingId = this.editingId();

    if (editingId) {
      this.transactions.update((current) =>
        current.map((tx) =>
          tx.id === editingId
            ? {
                ...tx,
                name: trimmedName,
                amount,
                category: this.category()
              }
            : tx
        )
      );
      this.clearForm();
      return;
    }

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      name: trimmedName,
      amount,
      category: this.category(),
      createdAt: new Date()
    };

    this.transactions.update((current) => [newTransaction, ...current]);
    this.clearForm();
  }

  protected startEdit(tx: Transaction) {
    this.editingId.set(tx.id);
    this.name.set(tx.name);
    this.valueText.set(String(tx.amount));
    this.category.set(tx.category);
  }

  protected cancelEdit() {
    this.clearForm();
  }

  protected deleteTransaction(id: string) {
    this.transactions.update((current) => current.filter((tx) => tx.id !== id));
    if (this.editingId() === id) {
      this.clearForm();
    }
  }

  protected formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  protected formatSigned(value: number) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign} ${this.formatCurrency(Math.abs(value))}`;
  }

  protected formatDate(date: Date) {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  protected formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });
  }

  private parseAmount(raw: string) {
    const normalized = raw.replace(',', '.').trim();
    const parsed = Number.parseFloat(normalized);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }

  private clearForm() {
    this.editingId.set(null);
    this.name.set('');
    this.valueText.set('');
    this.category.set(this.categories[0]);
  }

  private getMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private readFromStorage(): Transaction[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Transaction[];
      return parsed.map((tx) => ({
        ...tx,
        createdAt: new Date(tx.createdAt)
      }));
    } catch {
      return [];
    }
  }

  private writeToStorage(transactions: Transaction[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(transactions));
  }
}

type Transaction = {
  id: string;
  name: string;
  amount: number;
  category: string;
  createdAt: Date;
};
