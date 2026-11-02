import { supabase } from "./supabase.js";
import { initChat, cleanupChat } from "./chat.js";

const authScreen = document.getElementById("authScreen");
const chatScreen = document.getElementById("chatScreen");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubmit = document.getElementById("authSubmit");
const authToggle = document.getElementById("authToggle");
const authHint = document.getElementById("authHint");
const authError = document.getElementById("authError");
const usernameEl = document.getElementById("username");

let mode = "login";

authToggle.addEventListener("click", (e) => {
  e.preventDefault();
  mode = mode === "login" ? "register" : "login";
  authTitle.textContent = mode === "login" ? "Вход" : "Регистрация";
  authSubmit.textContent = mode === "login" ? "Войти" : "Зарегистрироваться";
  authHint.textContent = mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?";
  authToggle.textContent = mode === "login" ? "Зарегистрироваться" : "Войти";
  usernameEl.classList.toggle("hidden", mode === "login");
  usernameEl.required = mode === "register";
  authError.textContent = "";
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    if (mode === "register") {
      const username = usernameEl.value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Логин: 3-20 символов (a-z, 0-9, _)");

      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { username } }
      });
      if (error) throw error;
      if (!data.session) throw new Error("Отключи 'Confirm email' в Supabase → Auth → Providers → Email");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    authError.textContent = translateError(err.message);
  } finally {
    authSubmit.disabled = false;
  }
});

supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    authScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    await initChat(session.user);
  } else {
    cleanupChat();
    authScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => supabase.auth.signOut());

function translateError(msg = "") {
  if (msg.includes("Invalid login")) return "Неверный email или пароль";
  if (msg.includes("already registered")) return "Этот email уже занят";
  if (msg.includes("Password should be")) return "Пароль слишком короткий (мин. 6)";
  return msg;
}