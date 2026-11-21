/** The query key of the owner's manage view; `ManagePage` owns the query. */
export const manageViewKey = (slug: string) => ['manage', slug] as const;

/** Who gave what, nested under the manage view's key so every refetch of the view refreshes shown details too. */
export const giftDetailsKey = (slug: string) => [...manageViewKey(slug), 'gift-details'] as const;
