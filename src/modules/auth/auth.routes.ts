import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerAccount,
  verifyAccount,
  verifyMe,
  refreshToken,
  forgotPassword,
  resetPassword,
} from "./auth.controller";
import { routeProtector } from "../../middlewares/routeProtector";

// Rutas para la autenticacion y seguridad del usuario
// /login	-> Iniciar sesión (POST) ✔️
// /register ->	Registrar nuevo usuario (POST) ✔️
// /forgot-password ->	Solicitar reset de contraseña (POST)✔️
// /reset-password ->	Aplicar nueva contraseña (POST con token)✔️
// /verify-email	-> Confirmar correo (GET con token) ✔️
// /logout ->	Cerrar sesión (POST) ✔️
// /me	-> Obtener info del usuario autenticado (GET) ✔️
// /refresh-token ->	Renovar token de acceso (POST, opcional) ✔️

const router = Router();

router.get("/me", verifyMe);
router.get("/refresh-token", refreshToken);
router.post("/login", loginUser);
router.post("/register", registerAccount);
router.get("/verify-email", verifyAccount);
router.get("/logout", routeProtector(), logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
