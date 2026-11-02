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
const myAvatarEl = document.getElementById("myAvatar");

// Элементы модалки профиля
const profileModal = document.getElementById("profileModal");
const closeProfileModal = document.getElementById("closeProfileModal");
const profileBanner = document.getElementById("profileBanner");
const profileAvatarLarge = document.getElementById("profileAvatarLarge");
const settingsUsername = document.getElementById("settingsUsername");
const settingsPhone = document.getElementById("settingsPhone");
const settingsIsCreator = document.getElementById("settingsIsCreator");
const adminPanel = document.getElementById("adminPanel");
const saveProfileBtn = document.getElementById("saveProfileBtn");

export async function initChat(user) {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return alert("Ошибка профиля.");
  me = profile;
  
  updateMyUI();
  await loadUsers();
  subscribeRealtime();

  if (usersInterval) clearInterval(usersInterval);
  usersInterval = setInterval(async () => {
    await loadUsers();
    if (!searchEl.value.trim()) renderUsers();
  }, 5000);
}

export function cleanupChat() {
  me = null; activePeer = null; allUsers = [];
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (usersInterval) { clearInterval(usersInterval); usersInterval = null; }
  chatListEl.innerHTML = ""; messagesEl.innerHTML = "";
}

function updateMyUI() {
  const creatorIcon = me.is_creator ? ' <span class="creator-badge">🔥</span>' : '';
  myNameEl.innerHTML = "@" + me.username + creatorIcon;
  
  if (me.avatar_url) {
    myAvatarEl.innerHTML = `<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    myAvatarEl.textContent = me.username[0].toUpperCase();
  }
}

// === НАСТРОЙКИ ПРОФИЛЯ ===
export function openProfileModal() {
  if (!me) return;
  
  // Заполняем данные
  settingsUsername.value = me.username;
  settingsPhone.value = me.phone_number || "";
  
  if (me.avatar_url) {
    profileAvatarLarge.innerHTML = `<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    profileAvatarLarge.textContent = me.username[0].toUpperCase();
  }

  if (me.banner_url) {
    profileBanner.style.backgroundImage = `url(${me.banner_url})`;
  } else {
    profileBanner.style.backgroundImage = 'none';
  }

  // Показываем админку, если это админ
  if (me.is_admin) {
    adminPanel.classList.remove("hidden");
    settingsIsCreator.checked = me.is_creator || false;
  } else {
    adminPanel.classList.add("hidden");
  }

  profileModal.classList.remove("hidden");
}

closeProfileModal.addEventListener("click", () => {
  profileModal.classList.add("hidden");
});

// Загрузка аватарки
document.getElementById("uploadAvatarBtn").addEventListener("click", () => {
  document.getElementById("avatarUpload").click();
});

document.getElementById("avatarUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const filePath = `${me.id}/avatar_${Date.now()}.${file.name.split('.').pop()}`;
  
  const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
  if (error) return alert("Ошибка загрузки: " + error.message);

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  me.avatar_url = data.publicUrl;
  
  await supabase.from('profiles').update({ avatar_url: me.avatar_url }).eq('id', me.id);
  
  profileAvatarLarge.innerHTML = `<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  updateMyUI();
  alert("Аватарка обновлена!");
});

// Загрузка баннера
document.getElementById("uploadBannerBtn").addEventListener("click", () => {
  document.getElementById("bannerUpload").click();
});

document.getElementById("bannerUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const filePath = `${me.id}/banner_${Date.now()}.${file.name.split('.').pop()}`;
  
  const { error } = await supabase.storage.from('banners').upload(filePath, file, { upsert: true });
  if (error) return alert("Ошибка загрузки баннера: " + error.message);

  const { data } = supabase.storage.from('banners').getPublicUrl(filePath);
  me.banner_url = data.publicUrl;
  
  await supabase.from('profiles').update({ banner_url: me.banner_url }).eq('id', me.id);
  
  profileBanner.style.backgroundImage = `url(${me.banner_url})`;
  alert("Баннер обновлен!");
});

// Сохранение изменений профиля
saveProfileBtn.addEventListener("click", async () => {
  const newUsername = settingsUsername.value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(newUsername)) return alert("Логин: 3-20 символов (a-z, 0-9, _)");
  
  const updates = {
    username: newUsername,
    phone_number: settingsPhone.value.trim()
  };

  // Если админ - обновляем статус креатора
  if (me.is_admin) {
    updates.is_creator = settingsIsCreator.checked;
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', me.id);
  if (error) {
    if (error.code === '23505') return alert("Этот логин уже занят другим пользователем!");
    return alert("Ошибка сохранения: " + error.message);
  }

  me.username = newUsername;
  me.phone_number = updates.phone_number;
  if (me.is_admin) me.is_creator = updates.is_creator;

  updateMyUI();
  renderUsers(searchEl.value);
  alert("Профиль обновлен!");
  profileModal.classList.add("hidden");
});

// === ЗАГРУЗКА ДРУГИХ ПОЛЬЗОВАТЕЛЕЙ ===
async function loadUsers() {
  const { data } = await supabase.from("profiles").select("*").neq("id", me.id).order("username");
  if (data) allUsers = data;
}

function renderUsers(filter = "") {
  const q = filter.trim().toLowerCase().replace(/^@/, '');
  chatListEl.innerHTML = "";
  
  const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q));
  
  if (filtered.length > 0) {
    filtered.forEach(u => {
      const li = document.createElement("li");
      li.className = "chat-item" + (activePeer?.id === u.id ? " active" : "");
      const avatarHtml = u.avatar_url 
        ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : u.username[0].toUpperCase();
      
      const creatorIcon = u.is_creator ? ' <span class="creator-badge">🔥</span>' : '';
      
      li.innerHTML = `<div class="chat-item-avatar">${avatarHtml}</div><div><div class="chat-item-name">@${u.username}${creatorIcon}</div></div>`;
      li.addEventListener("click", () => openChat(u));
      chatListEl.appendChild(li);
    });
  } else if (q.length > 1) {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `<div style="padding: 10px; text-align: center; width: 100%; color: #5288c1; font-weight: 600; cursor: pointer;">🔍 Найти @${q}</div>`;
    li.addEventListener("click", () => searchAndStartChat(q));
    chatListEl.appendChild(li);
  }
}

searchEl.addEventListener("input", () => renderUsers(searchEl.value));

async function searchAndStartChat(username) {
  const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (data) {
    if (data.id === me.id) return alert("Это твой логин :)");
    if (!allUsers.find(u => u.id === data.id)) allUsers.push(data);
    openChat(data);
    searchEl.value = "";
  } else {
    alert(`Пользователь @${username} не найден.`);
  }
}

async function openChat(peer) {
  activePeer = peer;
  const creatorIcon = peer.is_creator ? ' <span class="creator-badge">🔥</span>' : '';
  titleEl.innerHTML = "@" + peer.username + creatorIcon;
  
  if (peer.avatar_url) {
    avatarEl.innerHTML = `<img src="${peer.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatarEl.textContent = peer.username[0].toUpperCase();
  }
  
  // Показываем телефон или статус в шапке
  document.getElementById("chatStatus").textContent = peer.phone_number || (peer.is_creator ? "Креатор" : "в сети");
  
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
  await supabase.from("messages").insert({ sender_id: me.id, recipient_id: activePeer.id, content: text });
});

function subscribeRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel("realtime-messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const msg = payload.new;
      if (activePeer && ((msg.sender_id === me.id && msg.recipient_id === activePeer.id) || (msg.sender_id === activePeer.id && msg.recipient_id === me.id))) {
        const hint = messagesEl.querySelector(".empty-hint");
        if (hint) hint.remove();
        const div = document.createElement("div");
        div.className = "message" + (msg.sender_id === me.id ? " out" : "");
        div.innerHTML = `${escapeHtml(msg.content)}<span class="time">${new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}</span>`;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }).subscribe();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}