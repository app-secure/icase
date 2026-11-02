package app;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class HttpSecurityFilterTest {
    private MockHttpServletResponse request(HttpSecurityFilter filter, String method, String uri, String origin, String preflight) throws Exception {
        var req = new MockHttpServletRequest(method, uri);
        req.setRemoteAddr("127.0.0.1");
        if (origin != null) req.addHeader("Origin", origin);
        if (preflight != null) req.addHeader("Access-Control-Request-Method", preflight);
        var res = new MockHttpServletResponse();
        filter.doFilter(req, res, (a, b) -> b.getWriter().write("ok"));
        return res;
    }
    @Test void headersAndCors() throws Exception {
        var filter = new HttpSecurityFilter(Map.of("APP_ENV", "production", "CORS_ORIGINS", "https://app.test"));
        var allowed = request(filter, "GET", "/api/data", "https://app.test", null);
        assertEquals("nosniff", allowed.getHeader("X-Content-Type-Options"));
        assertEquals("DENY", allowed.getHeader("X-Frame-Options"));
        assertEquals("https://app.test", allowed.getHeader("Access-Control-Allow-Origin"));
        assertEquals(403, request(filter, "GET", "/api/data", "https://evil.test", null).getStatus());
    }
    @Test void productionWithoutCorsAndPreflight() throws Exception {
        var filter = new HttpSecurityFilter(Map.of("APP_ENV", "production"));
        assertEquals(403, request(filter, "GET", "/api/data", "http://localhost:5173", null).getStatus());
        var local = new HttpSecurityFilter(Map.of("HTTP_RATE_MAX", "1"));
        assertEquals(204, request(local, "OPTIONS", "/api/data", "http://localhost:5173", "POST").getStatus());
        assertEquals(200, request(local, "GET", "/api/data", null, null).getStatus());
    }
    @Test void throttlesApiButNotHealth() throws Exception {
        var filter = new HttpSecurityFilter(Map.of("HTTP_RATE_MAX", "1"));
        assertEquals(200, request(filter, "GET", "/api/data", null, null).getStatus());
        var blocked = request(filter, "GET", "/api/data", null, null);
        assertEquals(429, blocked.getStatus());
        assertTrue(Integer.parseInt(blocked.getHeader("Retry-After")) > 0);
        assertEquals(200, request(filter, "GET", "/health", null, null).getStatus());
    }
    @Test void authLimitDoesNotBlockCrud() throws Exception {
        var filter = new HttpSecurityFilter(Map.of("AUTH_RATE_MAX", "1"));
        assertEquals(200, request(filter, "POST", "/api/auth/login", null, null).getStatus());
        assertEquals(429, request(filter, "POST", "/api/auth/register", null, null).getStatus());
        assertEquals(200, request(filter, "GET", "/api/data", null, null).getStatus());
    }
    @Test void invalidConfigurationFailsClosed() {
        assertThrows(IllegalArgumentException.class, () -> new HttpSecurityFilter(Map.of("HTTP_RATE_MAX", "0")));
        assertThrows(IllegalArgumentException.class, () -> new HttpSecurityFilter(Map.of("CORS_ORIGINS", "*")));
    }
    @Test void internalErrorsAreSanitized() {
        var response = new ErrorHandler().http(new HttpError(500, "password=secret"));
        assertEquals("Error interno del servidor", response.getBody().get("message"));
        assertFalse(response.getBody().containsKey("details"));
    }
}
