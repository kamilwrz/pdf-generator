import { useCallback, useEffect, useState } from "react";
import { ApiClient, ENDPOINTS } from "../services/api";

export function useEntitlements(enabled = true) {
    const [entitlements, setEntitlements] = useState(null);
    const [loading, setLoading] = useState(Boolean(enabled));
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token || !enabled) {
            setEntitlements(null);
            setLoading(false);
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const api = new ApiClient({ Authorization: `Bearer ${token}` });
            const data = await api.httpRequest(
                ENDPOINTS.AUTH.ENTITLEMENTS,
                "GET",
                null,
                "Nie udało się pobrać planu.",
            );
            setEntitlements(data);
            return data;
        } catch (err) {
            setError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { entitlements, loading, error, refresh };
}
