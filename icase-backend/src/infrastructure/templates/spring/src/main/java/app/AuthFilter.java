package app;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Exige sesión en todo /api (salvo inicio de sesión y registro) y aplica la matriz de permisos. */
@Component
public class AuthFilter extends OncePerRequestFilter {
    public static final String USER = "app.user";
    private final Auth auth;

    public AuthFilter(Auth auth) {
        this.auth = auth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!auth.enabled() || !path.startsWith("/api") || auth.isPublic(request.getMethod(), path)) {
            chain.doFilter(request, response);
            return;
        }
        try {
            Map<String, Object> user = auth.authenticate(request.getHeader("Authorization"));
            auth.authorize(user, request.getMethod(), path);
            request.setAttribute(USER, user);
        } catch (HttpError error) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", error.getMessage());
            response.setStatus(error.status());
            response.setContentType("application/json;charset=UTF-8");
            Support.JSON.writeValue(response.getOutputStream(), body);
            return;
        }
        chain.doFilter(request, response);
    }
}
