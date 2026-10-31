/** The query key of the owner's manage view; `ManagePage` owns the query. */
export const manageViewKey = (slug: string) => ['manage', slug] as const;
