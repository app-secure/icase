package app;

import java.util.List;
import java.util.Map;

/** Error con estado HTTP; el manejador global lo convierte en { message, details? }. */
public class HttpError extends RuntimeException {
    private final int status;
    private final List<Map<String, Object>> details;

    public HttpError(int status, String message) {
        this(status, message, null);
    }

    public HttpError(int status, String message, List<Map<String, Object>> details) {
        super(message);
        this.status = status;
        this.details = details;
    }

    public int status() {
        return status;
    }

    public List<Map<String, Object>> details() {
        return details;
    }
}
