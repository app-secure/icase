package app;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Controles HTTP previos a autenticación; límites locales al proceso, sin confiar en X-Forwarded-For. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class HttpSecurityFilter extends OncePerRequestFilter {
    private final Set<String> origins;
    private final long window;
    private final int max, authMax;
    private final Map<String, Bucket> buckets = new HashMap<>();
    private record Bucket(long until, int count) {}

    public HttpSecurityFilter() { this(System.getenv()); }
    HttpSecurityFilter(Map<String, String> env) {
        boolean production = "production".equals(env.get("APP_ENV"));
        origins = new HashSet<>();
        for (String value : env.getOrDefault("CORS_ORIGINS", production ? "" : "http://localhost:5173,http://localhost:8080").split(",")) {
            value = value.trim();
            if (value.isEmpty()) continue;
            if (!value.matches("https?://[^/]+") || value.contains("*")) throw new IllegalArgumentException("CORS_ORIGINS inválido");
            origins.add(value);
        }
        window = positive(env, "HTTP_RATE_WINDOW_MS", 60000);
        max = positive(env, "HTTP_RATE_MAX", 300);
        authMax = positive(env, "AUTH_RATE_MAX", 20);
    }
    private static int positive(Map<String, String> env, String key, int fallback) {
        String value = env.get(key);
        if (value == null || value.isBlank()) return fallback;
        try { int parsed = Integer.parseInt(value); if (parsed > 0) return parsed; }
        catch (NumberFormatException ignored) { }
        throw new IllegalArgumentException(key + " inválido");
    }
    private synchronized long consume(String key, long duration, int limit) {
        long now = System.currentTimeMillis();
        Bucket old = buckets.get(key);
        if (old == null || old.until() <= now) {
            if (buckets.size() >= 10000) buckets.entrySet().removeIf(e -> e.getValue().until() <= now);
            // Límite de memoria: ante saturación no crear entradas ilimitadas ni conceder acceso.
            if (!buckets.containsKey(key) && buckets.size() >= 10000) return 1;
            old = new Bucket(now + duration, 0);
        }
        if (old.count() >= limit) return Math.max(1, (old.until() - now + 999) / 1000);
        buckets.put(key, new Bucket(old.until(), old.count() + 1));
        return 0;
    }
    private void reject(HttpServletResponse res, int status, String message) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        Support.JSON.writeValue(res.getOutputStream(), Map.of("message", message));
    }
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        res.setHeader("Cache-Control", "no-store");
        if (req.isSecure()) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        res.addHeader("Vary", "Origin");
        String origin = req.getHeader("Origin");
        if (origin != null) {
            if (!origins.contains(origin)) { reject(res, 403, "Origen no permitido"); return; }
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Expose-Headers", "X-Total-Count,X-Page,X-Limit,X-Total-Pages");
        }
        if ("OPTIONS".equals(req.getMethod()) && req.getHeader("Access-Control-Request-Method") != null) {
            if (origin == null) { reject(res, 403, "Origen requerido"); return; }
            res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
            res.setStatus(204); return;
        }
        String uri = req.getRequestURI().substring(req.getContextPath().length());
        if (uri.equals("/api") || uri.startsWith("/api/")) {
            String ip = req.getRemoteAddr();
            long wait = consume("api:" + ip, window, max);
            if (wait == 0 && (uri.equals("/api/auth/login") || uri.equals("/api/auth/register"))) wait = consume("auth:" + ip, 900000, authMax);
            if (wait > 0) { res.setHeader("Retry-After", Long.toString(wait)); reject(res, 429, "Demasiadas solicitudes. Inténtalo más tarde."); return; }
        }
        chain.doFilter(req, res);
    }
}
