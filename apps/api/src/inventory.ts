import type pg from "pg";

type Db = Pick<pg.Pool, "query">;

/** Restore reserved stock for an order (idempotent — skips if already restored). */
export async function restoreOrderStock(db: Db, orderId: string): Promise<boolean> {
  const orderRes = await db.query(`SELECT stock_restored FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  const order = orderRes.rows[0] as { stock_restored?: boolean } | undefined;
  if (!order || order.stock_restored) return false;

  const items = await db.query(`SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`, [orderId]);
  for (const row of items.rows as { product_id: string; quantity: number }[]) {
    await db.query(`UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1`, [row.product_id, row.quantity]);
  }
  await db.query(`UPDATE orders SET stock_restored = true WHERE id = $1`, [orderId]);
  return true;
}

/** Reserve stock when an order is placed (before payment). */
export async function reserveOrderStock(
  db: Db,
  items: { productId: string; quantity: number }[],
): Promise<void> {
  for (const item of items) {
    const result = await db.query(
      `UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1 AND stock_quantity >= $2 RETURNING id`,
      [item.productId, item.quantity],
    );
    if (!result.rowCount) {
      throw new Error(`Insufficient stock for product ${item.productId}`);
    }
  }
}
