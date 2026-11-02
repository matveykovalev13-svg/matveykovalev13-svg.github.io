// ===== Данные чатов =====
const chats = [
  {
    id: 'saved',
    name: 'Избранное',
    avatar: '⭐',
    status: 'сохранённые сообщения',
    messages: []
  },
  {
    id: 'bot',
    name: 'Тест-бот',
    avatar: '🤖',
    status: 'бот для проверки',
    messages: [
      { text: 'Привет! Это тестовый чат.', time: '12:00', out: false }
    ]
  }
];

let activeChatId = 'saved';

// ===== DOM =====
const chatListEl = document.getElementById('chatList');
const messagesEl = document.getElementById('messages');
const chatTitleEl = document.getElementById('chatTitle');
const chatAvatarEl = document.getElementById('chatAvatar');
const chatStatusEl = document.getElementById('chatStatus');
const composerEl = document.getElementById('composer');
const messageInputEl = document.getElementById('messageInput');
const searchEl = document.getElementById('search');

// ===== Утилиты =====
function nowTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit'
  });
}

// ===== Хранилище (localStorage) =====
function saveChats() {
  localStorage.setItem('messenger-chats', JSON.stringify(chats));
}

function loadChats() {
  const saved = localStorage.getItem('messenger-chats');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    data.forEach(savedChat => {
      const chat = chats.find(c => c.id === savedChat.id);
      if (chat) chat.messages = savedChat.messages || [];
    });
  } catch (e) {
    console.warn('Не удалось загрузить историю', e);
  }
}

// ===== Рендер списка чатов =====
function renderChatList(filter = '') {
  chatListEl.innerHTML = '';
  const q = filter.trim().toLowerCase();

  chats
    .filter(c => c.name.toLowerCase().includes(q))
    .forEach(chat => {
      const last = chat.messages[chat.messages.length - 1];
      const li = document.createElement('li');
      li.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
      li.dataset.id = chat.id;
      li.innerHTML = `
        <div class="chat-item-avatar">${chat.avatar}</div>
        <div class="chat-item-body">
          <div class="chat-item-name">${chat.name}</div>
          <div class="chat-item-preview">${last ? escapeHtml(last.text) : 'Нет сообщений'}</div>
        </div>
      `;
      li.addEventListener('click', () => selectChat(chat.id));
      chatListEl.appendChild(li);
    });
}

// ===== Рендер сообщений =====
function renderMessages() {
  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  chatTitleEl.textContent = chat.name;
  chatAvatarEl.textContent = chat.avatar;
  chatStatusEl.textContent = chat.status;

  messagesEl.innerHTML = '';
  chat.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'message' + (msg.out ? ' out' : '');
    div.innerHTML = `
      ${escapeHtml(msg.text)}
      <span class="time">${msg.time}</span>
    `;
    messagesEl.appendChild(div);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== Выбор чата =====
function selectChat(id) {
  activeChatId = id;
  renderChatList(searchEl.value);
  renderMessages();
  messageInputEl.focus();
}

// ===== Отправка =====
composerEl.addEventListener('submit', e => {
  e.preventDefault();
  const text = messageInputEl.value.trim();
  if (!text) return;

  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  chat.messages.push({ text, time: nowTime(), out: true });

  // Эмуляция ответа для "Тест-бота"
  if (chat.id === 'bot') {
    setTimeout(() => {
      chat.messages.push({
        text: `Эхо: «${text}»`,
        time: nowTime(),
        out: false
      });
      saveChats();
      if (activeChatId === 'bot') renderMessages();
      renderChatList(searchEl.value);
    }, 600);
  }

  messageInputEl.value = '';
  saveChats();
  renderMessages();
  renderChatList(searchEl.value);
});

// ===== Поиск =====
searchEl.addEventListener('input', () => {
  renderChatList(searchEl.value);
});

// ===== Экранирование HTML =====
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== Инициализация =====
loadChats();
renderChatList();
renderMessages();
messageInputEl.focus();