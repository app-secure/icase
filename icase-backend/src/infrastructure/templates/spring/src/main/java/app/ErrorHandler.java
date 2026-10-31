package app;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Respuestas de error con la misma forma que la variante Node: { message, details? }. */
@RestControllerAdvice
public class ErrorHandler {
    private static ResponseEntity<Map<String, Object>> respond(int status, String message, Object details) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        if (details != null) body.put("details", details);
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(HttpError.class)
    public ResponseEntity<Map<String, Object>> http(HttpError error) {
        return respond(error.status(), error.getMessage(), error.details());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException error) {
        return respond(400, "El cuerpo debe ser un objeto", null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> missing(NoResourceFoundException error) {
        return respond(404, "Ruta inexistente", null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> method(HttpRequestMethodNotSupportedException error) {
        return respond(405, "Método no permitido", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception error) {
        error.printStackTrace();
        return respond(HttpStatus.INTERNAL_SERVER_ERROR.value(), "Error interno", null);
    }
}
