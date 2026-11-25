export interface FilterItemSchema {
  id: string;
  value: unknown;
  operator: string;
  joinOperator?: "and" | "or";
}
