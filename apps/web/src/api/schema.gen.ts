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
    "/api/instance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getInstance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guest-key-suggestion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["suggestGuestKey"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/owner-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["enterOwnerToken"];
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
        put: operations["editListDetails"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["addItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/manage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getManageView"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/items/{itemId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["editItem"];
        post?: never;
        delete: operations["deleteItem"];
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
    "/api/lists/{slug}/items/{itemId}/contributions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["pledgeContribution"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/holds/{holdId}/extend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["extendHold"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/holds/{holdId}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["releaseHold"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lists/{slug}/holds/{holdId}/purchase": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["markHoldPurchased"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ErrorResponse: {
            message: string;
            /** @enum {string} */
            code?: "item_unavailable" | "hold_not_active" | "hold_already_extended" | "no_payment_method" | "amount_out_of_range" | "item_has_guest_history";
            issues?: unknown[];
        };
    };
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
                    listDescription?: string;
                    createSecret?: string;
                    key: string;
                    venmoHandle?: string;
                    zelleHandle?: string;
                };
            };
        };
        responses: {
            /** @description The list was created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        slug: string;
                        ownerToken: string;
                        key: string;
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The create secret was missing or wrong. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
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
            /** @description The key was accepted and a session cookie was set. */
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
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or the key is wrong. The two are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getInstance: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Where this instance's source code is published, and who to contact about privacy (null when none is set). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sourceUrl: string;
                        privacyContact: string | null;
                    };
                };
            };
        };
    };
    suggestGuestKey: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A freshly generated guest key the create form can offer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        key: string;
                    };
                };
            };
        };
    };
    enterOwnerToken: {
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
                    ownerToken: string;
                };
            };
        };
        responses: {
            /** @description The token was accepted and an owner cookie was set. */
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
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or the token is wrong. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
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
            /** @description The list, its item, this session's holds, and what this server does for guests. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        title: string;
                        description: string | null;
                        items: {
                            id: string;
                            title: string;
                            /** @enum {string} */
                            type: "single" | "group";
                            /** @enum {string} */
                            status: "available" | "held" | "purchased";
                            availableUnits: number;
                            url: string | null;
                            description: string | null;
                            priceMinor: number | null;
                            pledgedMinor: number | null;
                        }[];
                        payment: {
                            venmoHandle: string | null;
                            zelleHandle: string | null;
                        };
                        myHolds: {
                            holdId: string;
                            itemId: string;
                            /** @enum {string} */
                            status: "active" | "expired" | "released" | "purchased";
                            expiresAt: string;
                            extendedAt: string | null;
                            actions: {
                                extend: boolean;
                                release: boolean;
                                purchase: boolean;
                            };
                        }[];
                        capabilities: {
                            holdDurationDays: number;
                        };
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or no valid session for it. The two are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    editListDetails: {
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
                    title: string;
                    description?: string;
                };
            };
        };
        responses: {
            /** @description The list's title and description were changed. */
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
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or no owner cookie for it. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    addItem: {
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
                    /** @enum {string} */
                    type: "single";
                    title: string;
                    description?: string;
                    /** @default 1 */
                    quantity?: number;
                    /** Format: uri */
                    url?: string;
                    priceMinor?: number;
                } | {
                    /** @enum {string} */
                    type: "group";
                    title: string;
                    description?: string;
                    /** Format: uri */
                    url?: string;
                    priceMinor: number;
                };
            };
        };
        responses: {
            /** @description The item was added to the list. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        itemId: string;
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or no owner cookie for it. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description A group gift needs a payment method on the list (no_payment_method). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getManageView: {
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
            /** @description The list as its owner edits it, with the guest key. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        title: string;
                        description: string | null;
                        key: string;
                        items: {
                            id: string;
                            /** @enum {string} */
                            type: "single" | "group";
                            title: string;
                            quantity: number;
                            priceMinor: number | null;
                            url: string | null;
                            description: string | null;
                            deletable: boolean;
                            committedUnits: number;
                            pledgedMinor: number | null;
                        }[];
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list, or no owner cookie for it. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    editItem: {
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
                    title: string;
                    quantity: number;
                    priceMinor?: number;
                    /** Format: uri */
                    url?: string;
                    description?: string;
                };
            };
        };
        responses: {
            /** @description The item's details were changed. */
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
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or item, or no owner cookie for the list. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    deleteItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                itemId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The item was deleted. */
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
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or item, or no owner cookie for the list. Deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description A guest has held, bought or pledged towards the item, so it stays (item_has_guest_history). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
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
                    name: string;
                    message?: string;
                };
            };
        };
        responses: {
            /** @description The item is now held for this session; a replayed idempotency key returns the same hold. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        holdId: string;
                        itemId: string;
                        /** @enum {string} */
                        status: "active" | "expired" | "released" | "purchased";
                        expiresAt: string;
                        extendedAt: string | null;
                        actions: {
                            extend: boolean;
                            release: boolean;
                            purchase: boolean;
                        };
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or item, or no valid session for the list. These are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No unit of the item is free (item_unavailable), or a concurrent change won (no code). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    pledgeContribution: {
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
                    amountMinor: number;
                    name: string;
                    message?: string;
                };
            };
        };
        responses: {
            /** @description The pledge was recorded; a replayed idempotency key returns the original. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        contributionId: string;
                        itemId: string;
                        amountMinor: number;
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or item, or no valid session for the list. These are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The item is not a group gift, or this idempotency key belongs to another guest (item_unavailable); the amount is more than the gift can take (amount_out_of_range); or a concurrent change won (no code). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    extendHold: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                holdId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The hold was extended once, by the configured duration, from its current expiry. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        holdId: string;
                        itemId: string;
                        /** @enum {string} */
                        status: "active" | "expired" | "released" | "purchased";
                        expiresAt: string;
                        extendedAt: string | null;
                        actions: {
                            extend: boolean;
                            release: boolean;
                            purchase: boolean;
                        };
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or hold, no valid session for the list, or the hold is not this session's. These are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The hold is not active (hold_not_active) or was already extended (hold_already_extended). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    releaseHold: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                holdId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The hold was released; its unit is free for others. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        holdId: string;
                        itemId: string;
                        /** @enum {string} */
                        status: "active" | "expired" | "released" | "purchased";
                        expiresAt: string;
                        extendedAt: string | null;
                        actions: {
                            extend: boolean;
                            release: boolean;
                            purchase: boolean;
                        };
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or hold, no valid session for the list, or the hold is not this session's. These are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The hold is not active (hold_not_active). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    markHoldPurchased: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                holdId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The hold was marked purchased. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        holdId: string;
                        itemId: string;
                        /** @enum {string} */
                        status: "active" | "expired" | "released" | "purchased";
                        expiresAt: string;
                        extendedAt: string | null;
                        actions: {
                            extend: boolean;
                            release: boolean;
                            purchase: boolean;
                        };
                    };
                };
            };
            /** @description The request did not match the schema, or a domain rule refused it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No such list or hold, no valid session for the list, or the hold is not this session's. These are deliberately indistinguishable. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description The hold was already released or purchased (hold_not_active), or it expired and no unit is free any more (item_unavailable). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
