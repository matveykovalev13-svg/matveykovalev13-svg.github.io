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
const statusEl = document.getElementById("chatStatus");
const myNameEl = document.getElementById("myName");
const myAvatarEl = document.getElementById("myAvatar");

const viewProfileModal = document.getElementById("viewProfileModal");
const settingsModal = document.getElementById("settingsModal");

export async function initChat(user) {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return alert("Ошибка профиля.");
  me = profile;
  
  updateMyUI();
  await loadUsers();
  subscribeRealtime();

  if (usersInterval) clearInterval(usersInterval);
  usersInterval = setInterval(() => {
    loadUsers();
    if (!searchEl.value.trim()) renderUsers();
  }, 5000);

  // Показываем кнопку "Создать канал", если ты админ
  if (me.is_admin) {
    document.getElementById("createChannelBtnContainer").classList.remove("hidden");
  }

  // --- Кнопка СОЗДАНИЯ КАНАЛА ---
  document.getElementById("createChannelBtn").onclick = async () => {
    const name = prompt("Введите название канала (логин, например 'my_news'):");
    if (!name) return;
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Создаем запись в базе
    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(), // Генерируем случайный UUID для канала
      username: cleanName,
      is_admin: true,
      is_creator: true,
      phone_number: 'Канал',
      display_id: Math.floor(Math.random() * 900000 + 100000).toString(),
      avatar_url: 'https://img.icons8.com/color/96/000000/bullhorn.png'
    });

    if (error) {
      if (error.code === '23505') alert("Канал с таким логином уже существует!");
      else alert("Ошибка: " + error.message);
    } else {
      alert("Канал создан! Обновите страницу.");
      await loadUsers();
      renderUsers();
    }
  };

  // Обработчики интерфейса
  document.getElementById("openProfileBtn").onclick = () => openSettingsModal();
  document.getElementById("chatHeaderProfileBtn").onclick = () => { if (activePeer) openProfileView(activePeer); };
  document.getElementById("closeViewProfile").onclick = () => viewProfileModal.classList.add("hidden");
  document.getElementById("closeSettings").onclick = () => settingsModal.classList.add("hidden");
  document.getElementById("logoutBtn").onclick = () => supabase.auth.signOut();

  // Загрузка аватарки и баннера (личный профиль)
  document.getElementById("uploadAvatarBtn").onclick = () => document.getElementById("avatarUpload").click();
  document.getElementById("avatarUpload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const filePath = `${me.id}/avatar_${Date.now()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    me.avatar_url = data.publicUrl;
    await supabase.from('profiles').update({ avatar_url: me.avatar_url }).eq('id', me.id);
    document.getElementById("settingsAvatar").innerHTML = `<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    updateMyUI();
  };

  document.getElementById("uploadBannerBtn").onclick = () => document.getElementById("bannerUpload").click();
  document.getElementById("bannerUpload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const filePath = `${me.id}/banner_${Date.now()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('banners').upload(filePath, file, { upsert: true });
    const { data } = supabase.storage.from('banners').getPublicUrl(filePath);
    me.banner_url = data.publicUrl;
    await supabase.from('profiles').update({ banner_url: me.banner_url }).eq('id', me.id);
    document.getElementById("settingsBanner").style.backgroundImage = `url(${me.banner_url})`;
  };

  document.getElementById("saveProfileBtn").onclick = async () => {
    const newUsername = document.getElementById("settingsUsername").value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(newUsername)) return alert("Логин: 3-20 символов");
    const updates = {
      username: newUsername,
      phone_number: document.getElementById("settingsPhone").value.trim()
    };
    if (me.is_admin) updates.is_creator = document.getElementById("settingsIsCreator").checked;
    const { error } = await supabase.from('profiles').update(updates).eq('id', me.id);
    if (error) return alert(error.code === '23505' ? "Логин занят!" : "Ошибка: " + error.message);
    me.username = newUsername;
    me.phone_number = updates.phone_number;
    if (me.is_admin) me.is_creator = updates.is_creator;
    updateMyUI(); loadUsers(); settingsModal.classList.add("hidden"); alert("Сохранено!");
  };

  // Фото в чат
  document.getElementById("uploadChatImageBtn").onclick = () => document.getElementById("chatImageUpload").click();
  document.getElementById("chatImageUpload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activePeer) return;
    const filePath = `${me.id}/chat_${Date.now()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('chat_images').upload(filePath, file);
    const { data } = supabase.storage.from('chat_images').getPublicUrl(filePath);
    await supabase.from("messages").insert({ sender_id: me.id, recipient_id: activePeer.id, image_url: data.publicUrl });
    e.target.value = "";
  };
}

export function cleanupChat() {
  me = null; activePeer = null; allUsers = [];
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (usersInterval) { clearInterval(usersInterval); usersInterval = null; }
  chatListEl.innerHTML = ""; messagesEl.innerHTML = "";
}

function updateMyUI() {
  const creatorIcon = me.is_creator ? ' <i class="fa-solid fa-fire creator-badge"></i>' : '';
  myNameEl.innerHTML = "@" + me.username + creatorIcon;
  if (me.avatar_url) myAvatarEl.innerHTML = `<img src="${me.avatar_url}">`;
  else myAvatarEl.textContent = me.username[0].toUpperCase();
}

async function loadUsers() {
  const { data } = await supabase.from("profiles").select("*").neq("id", me.id).order("username");
  if (data) allUsers = data;
}

function renderUsers(filter = "") {
  const q = filter.trim().toLowerCase().replace(/^@/, '');
  chatListEl.innerHTML = "";
  
  allUsers.filter(u => u.username.toLowerCase().includes(q)).forEach(u => {
    const li = document.createElement("li");
    li.className = "chat-item" + (activePeer?.id === u.id ? " active" : "");
    const avatarHtml = u.avatar_url ? `<img src="${u.avatar_url}">` : u.username[0].toUpperCase();
    const creatorIcon = u.is_creator ? ' <i class="fa-solid fa-fire creator-badge"></i>' : '';
    const isChannel = u.is_admin && !u.username.includes('_test'); // Просто проверка на канал
    
    li.innerHTML = `
      <div class="chat-item-avatar" style="${isChannel ? 'background: #e74c3c;' : ''}">${avatarHtml}</div>
      <div class="chat-item-info">
        <div class="chat-item-name">${isChannel ? '📢' : '@'}${u.username}${creatorIcon}</div>
        <div class="chat-item-preview">${u.phone_number || 'в сети'}</div>
      </div>`;
    li.onclick = () => openChat(u);
    chatListEl.appendChild(li);
  });
}

searchEl.addEventListener("input", () => renderUsers(searchEl.value));

async function openChat(peer) {
  activePeer = peer;
  const creatorIcon = peer.is_creator ? ' <i class="fa-solid fa-fire creator-badge"></i>' : '';
  titleEl.innerHTML = (peer.is_admin && !peer.username.includes('_test') ? "📢 " : "@") + peer.username + creatorIcon;
  statusEl.textContent = peer.phone_number || "в сети";
  
  if (peer.avatar_url) {
    avatarEl.innerHTML = `<img src="${peer.avatar_url}">`;
  } else {
    avatarEl.textContent = peer.username[0].toUpperCase();
  }
  
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
  messages.forEach(msg => appendMessageUI(msg));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessageUI(msg) {
  const hint = messagesEl.querySelector(".empty-hint");
  if (hint) hint.remove();
  const div = document.createElement("div");
  div.className = "message " + (msg.sender_id === me.id ? "out" : "in");
  let content = "";
  if (msg.image_url) content += `<img src="${msg.image_url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 5px; display: block;">`;
  if (msg.content) content += escapeHtml(msg.content);
  div.innerHTML = `${content}<span class="time">${new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}</span>`;
  messagesEl.appendChild(div);
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
        appendMessageUI(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }).subscribe();
}

function openProfileView(peer) {
  if (!peer) return;
  document.getElementById("viewProfileBanner").style.backgroundImage = peer.banner_url ? `url(${peer.banner_url})` : 'linear-gradient(45deg, #1f2c38, #2b3a4a)';
  const avatarEl = document.getElementById("viewProfileAvatar");
  if (peer.avatar_url) avatarEl.innerHTML = `<img src="${peer.avatar_url}">`;
  else avatarEl.textContent = peer.username[0].toUpperCase();
  const creatorIcon = peer.is_creator ? ' <i class="fa-solid fa-fire creator-badge"></i>' : '';
  document.getElementById("viewProfileName").innerHTML = "@" + peer.username + creatorIcon;
  document.getElementById("viewProfileId").textContent = "ID: " + (peer.display_id || "000000");
  document.getElementById("viewProfilePhone").textContent = peer.phone_number || "Номер скрыт";
  viewProfileModal.classList.remove("hidden");
}

function openSettingsModal() {
  document.getElementById("settingsUsername").value = me.username;
  document.getElementById("settingsPhone").value = me.phone_number || "";
  const avatarEl = document.getElementById("settingsAvatar");
  if (me.avatar_url) avatarEl.innerHTML = `<img src="${me.avatar_url}">`;
  else avatarEl.textContent = me.username[0].toUpperCase();
  document.getElementById("settingsBanner").style.backgroundImage = me.banner_url ? `url(${me.banner_url})` : 'linear-gradient(45deg, #1f2c38, #2b3a4a)';
  if (me.is_admin) {
    document.getElementById("adminPanel").classList.remove("hidden");
    document.getElementById("settingsIsCreator").checked = me.is_creator || false;
  } else document.getElementById("adminPanel").classList.add("hidden");
  settingsModal.classList.remove("hidden");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}