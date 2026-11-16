/** The thanks after a purchase: a hold of more than one unit says how many were bought. */
export const purchasedMessage = (itemTitle: string, heldUnits: number, boughtUnits: number | null): string =>
  heldUnits > 1 ? `${itemTitle}: ${boughtUnits} marked as purchased. Thank you!` : `${itemTitle} is marked as purchased. Thank you!`;
