const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export function isAddress(value: string): value is `0x${string}` {
    return ADDRESS_RE.test(value);
}

export function normalizeAddress(value: string): `0x${string}` {
    return value.toLowerCase() as `0x${string}`;
}

export function validateTokenAddress(value: string | undefined): { ok: true; value: `0x${string}` } | { ok: false; error: string } {
    if (!value || !isAddress(value)) {
        return { ok: false, error: "Invalid tokenAddress" };
    }

    return { ok: true, value: normalizeAddress(value) };
}

export function validateExternalUserId(value: string | undefined): { ok: true; value: string } | { ok: false; error: string } {
    if (!value) {
        return { ok: false, error: "userId is required" };
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 128 || CONTROL_CHAR_RE.test(trimmed)) {
        return { ok: false, error: "Invalid userId" };
    }

    return { ok: true, value: trimmed };
}

export function validateChainId(value: number | undefined, fallback: number): { ok: true; value: number } | { ok: false; error: string } {
    const chainId = value ?? fallback;
    if (!Number.isInteger(chainId) || chainId <= 0) {
        return { ok: false, error: "Invalid chainId" };
    }

    return { ok: true, value: chainId };
}

export function validatePaginationLimit(value: string | undefined, fallback = 50, max = 100):
    | { ok: true; value: number }
    | { ok: false; error: string } {
    if (value === undefined) {
        return { ok: true, value: fallback };
    }

    if (!/^\d+$/.test(value)) {
        return { ok: false, error: "Invalid limit" };
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
        return { ok: false, error: `limit must be between 1 and ${max}` };
    }

    return { ok: true, value: parsed };
}

export function validateCursor(value: string | undefined):
    | { ok: true; value: Date | null }
    | { ok: false; error: string } {
    if (value === undefined) {
        return { ok: true, value: null };
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
        return { ok: false, error: "Invalid cursor" };
    }

    return { ok: true, value: parsed };
}
