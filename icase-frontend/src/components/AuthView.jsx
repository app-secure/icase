import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail, User, Phone, Check, AlertCircle, ArrowRight } from "lucide-react";
import RbixLogo from "./RbixLogo";
import { loginApi, registroApi, setAuthToken, setStoredUser } from "../services/api";

export default function AuthView({ onAuthSuccess, onLoadingChange }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Campos de formulario
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [celular, setCelular] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!correo || !password) {
      setError("Por favor completa los campos obligatorios.");
      return;
    }

    if (!isLogin) {
      if (!nombre || !apellido || !celular) {
        setError("Por favor completa tu nombre, apellido y celular.");
        return;
      }
      if (password.length < 6) {
        setError("La contraseña debe tener mínimo 6 caracteres.");
        return;
      }
      if (!agreeTerms) {
        setError("Debes aceptar los términos y la política de privacidad.");
        return;
      }
    }

    setLoading(true);
    if (onLoadingChange) onLoadingChange(true, isLogin ? "Iniciando sesión..." : "Creando tu cuenta...");
    try {
      if (isLogin) {
        const res = await loginApi(correo, password);
        if (res.token && res.usuario) {
          setAuthToken(res.token);
          setStoredUser(res.usuario);
          // Pausa para que el overlay sea visible antes del cambio de vista
          await new Promise((r) => setTimeout(r, 800));
          onAuthSuccess(res.usuario, res.token);
        }
      } else {
        const res = await registroApi({
          nombre,
          apellido,
          celular,
          correo,
          password
        });
        if (res.token && res.usuario) {
          setAuthToken(res.token);
          setStoredUser(res.usuario);
          await new Promise((r) => setTimeout(r, 800));
          onAuthSuccess(res.usuario, res.token);
        }
      }
    } catch (err) {
      setError(err.message || "Error al procesar la solicitud.");
      if (onLoadingChange) onLoadingChange(false, "");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden select-none bg-[#0d0f12]">
      {/* Fondo atmosférico y cinemático inspirado en la Imagen de Referencia */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 scale-105 filter blur-[1px]"
        style={{
          backgroundImage: `radial-gradient(ellipse at 75% 20%, rgba(234, 88, 12, 0.45) 0%, rgba(180, 83, 9, 0.25) 35%, transparent 70%),
                            radial-gradient(ellipse at 20% 80%, rgba(124, 58, 237, 0.35) 0%, rgba(16, 185, 129, 0.15) 40%, transparent 75%),
                            linear-gradient(180deg, #090a0f 0%, #151019 50%, #0d0f12 100%)`
        }}
      />

      {/* Halo de luz cálido estilo crepúsculo */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Tarjeta flotante oscura con acabados premium y bordes redondeados */}
      <div className="relative z-10 w-full max-w-md bg-[#16181d]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] text-white transition-all">
        {/* Logo RBIX centrado en cabecera */}
        <div className="flex items-center justify-center mb-7">
          <RbixLogo size="md" isDark={true} />
        </div>

        {/* Títulos */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isLogin ? "Bienvenido de nuevo" : "Únete a nosotros"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {isLogin
              ? "Ingresa tus credenciales para acceder a tus especificaciones de software."
              : "Configura tu perfil profesional e ingresa ahora mismo."}
          </p>
        </div>

        {/* Alerta de error si existe */}
        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs animate-shake">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <>
              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-[#20232a] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
                    required
                  />
                </div>
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Apellido"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="w-full bg-[#20232a] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Celular */}
              <div className="relative">
                <Phone size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="tel"
                  placeholder="Número de celular"
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  className="w-full bg-[#20232a] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
                  required
                />
              </div>
            </>
          )}

          {/* Correo Electrónico */}
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="w-full bg-[#20232a] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Contraseña con toggle Eye */}
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#20232a] border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* Checkbox de Términos (en Registro) */}
          {!isLogin && (
            <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 rounded bg-[#20232a] border-white/20 text-purple-600 focus:ring-0 cursor-pointer"
              />
              <span>Acepto las Reglas y el Aviso de Privacidad</span>
            </label>
          )}

          {/* Botón Principal (estilo 'Launch Account') */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-white hover:bg-slate-100 text-slate-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{isLogin ? "Iniciar Sesión" : "Crear Cuenta"}</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Separador */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <span className="relative bg-[#16181d] px-3 text-[11px] text-slate-500 uppercase tracking-widest">
            {isLogin ? "o accede con" : "seguridad garantizada"}
          </span>
        </div>

        {/* Alternador inferior de Login / Registro */}
        <div className="text-center pt-1">
          {isLogin ? (
            <p className="text-xs text-slate-400">
              ¿No tienes una cuenta aún?{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError("");
                }}
                className="text-white hover:text-purple-400 font-semibold underline underline-offset-4 transition-colors cursor-pointer ml-1"
              >
                Regístrate gratis
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              ¿Ya tienes una cuenta registrada?{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError("");
                }}
                className="text-white hover:text-purple-400 font-semibold underline underline-offset-4 transition-colors cursor-pointer ml-1"
              >
                Inicia sesión aquí
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
