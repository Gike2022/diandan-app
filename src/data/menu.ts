export type Dish = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  priceCents?: number;
  imageUrl: string;
  soldOut?: boolean;
};
