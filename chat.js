import { supabase } from "./supabase.js";

let me = null;
let activePeer = null;
let allUsers = [];
let realtimeChannel = null;
let usersInterval = null;

const chatListEl = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("messageInput");
const searchEl = document.getElementById("userSearch");
const titleEl = document.getElementById("chatTitle");
const avatarEl = document.getElementById("chatAvatar");
const myNameEl = document.getElementById("myName");

export async function initChat(user) {
  const { data: profile, error } = await supabase.from("profiles").select("id, username").eq("id", user.id).single();
  if (error) { 
    console.error("Profile load error:", error); 
    alert("Ошибка загрузки профиля. Возможно, база не настроена.");
    return; 
  }
  
  me = profile;
  myNameEl.textContent = "@" + me.username;
  
  await loadUsers();
  subscribeRealtime();

  // Автообновление списка пользователей каждые 5 секунд (чтобы видеть новых друзей)
  if (usersInterval) clearInterval(usersInterval);
  usersInterval = setInterval(async () => {
    await loadUsers();
    // Если открыт чат, обновляем только если фильтр пустой (чтобы не сбивать поиск)
    if (!searchEl.value.trim()) renderUsers();
  }, 5000);
}

export function cleanupChat() {
  me = null; activePeer = null; allUsers = [];
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (usersInterval) { clearInterval(usersInterval); usersInterval = null; }
  chatListEl.innerHTML = ""; messagesEl.innerHTML = "";
}

async function loadUsers() {
  const { data, error } = await supabase.from("profiles").select("id, username").neq("id", me.id).order("username");
  if (!error && data) { 
    allUsers = data; 
  }
}

// ===== РЕНДЕР СПИСКА (с поиском по @username) =====
function renderUsers(filter = "") {
  const q = filter.trim().toLowerCase().replace(/^@/, ''); // Убираем @ если есть
  chatListEl.innerHTML = "";
  
  const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q));
  
  if (filtered.length > 0) {
    filtered.forEach(u => {
      const li = document.createElement("li");
      li.className = "chat-item" + (activePeer?.id === u.id ? " active" : "");
      li.innerHTML = `<div class="chat-item-avatar">${u.username[0].toUpperCase()}</div><div><div class="chat-item-name">@${u.username}</div></div>`;
      li.addEventListener("click", () => openChat(u));
      chatListEl.appendChild(li);
    });
  } else if (q.length > 1) {
    // Если ввели точный ник и его нет в списке - показываем кнопку поиска в базе
    const li = document.createElement("li");
    li.className = "chat-item";
    li.style.background = "#1c2733";
    li.innerHTML = `<div style="padding: 10px; text-align: center; width: 100%; color: #5288c1; font-weight: 600; cursor: pointer;">🔍 Найти и начать чат с @${q}</div>`;
    li.addEventListener("click", () => searchAndStartChat(q));
    chatListEl.appendChild(li);
  } else {
    chatListEl.innerHTML = `<li style="padding:16px;color:#7d8b99;font-size:13px;text-align:center;">Нет пользователей в списке.<br>Введите @логин для поиска.</li>`;
  }
}

searchEl.addEventListener("input", () => renderUsers(searchEl.value));

// ===== ПРИНУДИТЕЛЬНЫЙ ПОИСК ПО БАЗЕ (если юзера нет в списке) =====
async function searchAndStartChat(username) {
  // Ищем в базе точное совпадение
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .maybeSingle(); // вернет null, если не найдет

  if (error) {
    alert("Ошибка поиска: " + error.message);
    return;
  }
  
  if (data) {
    if (data.id === me.id) {
      alert("Это твой собственный логин :)");
      return;
    }
    if (!allUsers.find(u => u.id === data.id)) {
      allUsers.push(data); // Добавляем в локальный список
    }
    openChat(data);
    searchEl.value = ""; // Очищаем поиск
    renderUsers();
  } else {
    alert(`Пользователь @${username} не найден в базе. Возможно, он еще не зарегистрировался.`);
    searchEl.value = "";
    renderUsers();
  }
}

async function openChat(peer) {
  activePeer = peer;
  titleEl.textContent = "@" + peer.username;
  avatarEl.textContent = peer.username[0].toUpperCase();
  composerEl.classList.remove("hidden");
  renderUsers(searchEl.value);
  await loadMessages();
  inputEl.focus();
}

async function loadMessages() {
  if (!activePeer) return;
  const { data } = await supabase.from("messages").select("*")
    .or(`and(sender_id.eq.${me.id},recipient_id.eq.${activePeer.id}),and(sender_id.eq.${activePeer.id},recipient_id.eq.${me.id})`)
    .order("created_at", { ascending: true });
  renderMessages(data || []);
}

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  if (!messages.length) { messagesEl.innerHTML = `<div class="empty-hint">Напиши первое сообщение!</div>`; return; }
  messages.forEach(msg => {
    const div = document.createElement("div");
    div.className = "message" + (msg.sender_id === me.id ? " out" : "");
    div.innerHTML = `${escapeHtml(msg.content)}<span class="time">${new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}</span>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

composerEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || !activePeer) return;
  inputEl.value = "";
  const { error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: activePeer.id, content: text });
  if (error) { console.error(error); inputEl.value = text; alert("Ошибка: " + error.message); }
});

function subscribeRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  
  realtimeChannel = supabase.channel("realtime-messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const msg = payload.new;
      // Проверяем, что сообщение относится к нам
      if (msg.sender_id === me.id || msg.recipient_id === me.id) {
        // Если открыт чат с этим человеком, отрисовываем
        if (activePeer && ((msg.sender_id === me.id && msg.recipient_id === activePeer.id) || (msg.sender_id === activePeer.id && msg.recipient_id === me.id))) {
          const hint = messagesEl.querySelector(".empty-hint");
          if (hint) hint.remove();
          
          const div = document.createElement("div");
          div.className = "message" + (msg.sender_id === me.id ? " out" : "");
          div.innerHTML = `${escapeHtml(msg.content)}<span class="time">${new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}</span>`;
          messagesEl.appendChild(div);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }
    }).subscribe();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}