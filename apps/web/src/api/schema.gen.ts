// Generated from apps/api/openapi.json by `npm run gen:api` (ADR-0077). Do not edit.

export interface paths {
    "/api/lists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createList"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["enterGuestKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getListView"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/items/{itemId}/hold": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["holdItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createList: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    listTitle: string;
                    itemTitle: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        slug: string;
                        ownerToken: string;
                        key: string;
                        itemId: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
        };
    };
    enterGuestKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    key: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
            /** @description Default Response */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
        };
    };
    getListView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        title: string;
                        item: {
                            id: string;
                            title: string;
                            /** @enum {string} */
                            status: "available" | "held";
                        };
                    };
                };
            };
            /** @description Default Response */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
        };
    };
    holdItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                itemId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        holdId: string;
                        itemId: string;
                        expiresAt: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
            /** @description Default Response */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                        issues?: unknown[];
                    };
                };
            };
        };
    };
}
