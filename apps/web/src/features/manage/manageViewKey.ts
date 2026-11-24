/** The query key of the owner's manage view; `ManagePage` owns the query. */
export const manageViewKey = (slug: string) => ['manage', slug] as const;

/** Who gave what, nested under the manage view's key so every refetch of the view refreshes shown details too. */
export const contributionsKey = (slug: string) => [...manageViewKey(slug), 'contributions'] as const;
