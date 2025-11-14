import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
// Import SyntaxHighlighter for code formatting (install required: react-syntax-highlighter)
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// Use a dark blue theme for the code blocks
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism'; 
import { Send, PlusSquare, Volume2, Copy, MessageSquare, User, Settings, Clock, Trash2, Sun, Moon, Zap, ChevronLeft } from "react-feather";

// Corrected relative imports for assets
import whiteLogo from '../assets/white.png'; 
import blackLogo from '../assets/black.png';

// Ensure this matches the name of your CSS file
import './ChatAssistant.css'; 

// --- Utility Function for Robust Streaming (Kept for API functionality) ---
const parseStreamingLine = (line) => {
    const trimmedLine = line.trim();
    if (trimmedLine === 'data: [DONE]') { return { json: null, done: true }; }
    if (trimmedLine.startsWith('data: ')) {
        const jsonString = trimmedLine.substring(6);
        try {
            const json = JSON.parse(jsonString);
            return { json, done: false };
        } catch (e) {
            console.warn("Could not parse JSON from streaming line:", jsonString, e);
            return { json: null, done: false };
        }
    }
    return { json: null, done: false };
};

// --- System Prompt (Unified Mode) ---
const getSystemPrompt = () => `You are AlgoMITra, an AI tutor. You are optimized to provide clear, comprehensive, and runnable solutions.
// CORE DIRECTIVE: You are strictly an AI tutor for algorithms, data structures, and programming concepts.
// If the user's message is NOT technical (e.g., about history, cooking, weather, or current events),
// you MUST politely decline and ask them to keep the topic focused on technical subjects.
// Example decline: "I'm only trained to help with algorithms and programming. Please ask a technical question!"

// When a technical problem is presented, you MUST follow this unified structure:
// 1. Briefly explain the **Conceptual Logic** (e.g., using a stack for parentheses).
// 2. Provide the **Complete, Runnable Code Solution** immediately, wrapped in a markdown code block.

**General Style:** Always be encouraging and direct.`;


// --- Component Fragments ---

const PageTabs = ({ onNewChat, view, setView, isSidebarOpen, setIsSidebarOpen }) => {
  return (
    <div className="chat-tabs">
        <button onClick={() => setIsSidebarOpen(false)} className="tab-button sidebar-toggle" title="Collapse Sidebar"><ChevronLeft size={20} /></button>
      <button onClick={onNewChat} className="tab-button" title="New Chat"><PlusSquare size={20} /></button>
      <button onClick={() => setView('history')} className={`tab-button ${view === 'history' ? 'active' : ''}`} title="History"><Clock size={20} /></button>
      <div className="tab-spacer"></div>
      <button className="tab-button" title="Settings (coming soon)"><Settings size={20} /></button>
    </div>
  );
};

// Updated Toggle to use a 'blue-dark' theme
const DarkModeToggle = ({ darkMode, setDarkMode }) => {
  return (
    <div className="dark-mode-toggle-container" title="Toggle Dark Mode">
      <Sun size={18} className="icon-light" /> 
      <label className="toggle-switch">
        <input 
          type="checkbox" 
          checked={darkMode} 
          onChange={(e) => setDarkMode(e.target.checked)} 
        />
        <span className="slider round"></span>
      </label>
      <Moon size={18} className="icon-dark" /> 
    </div>
  );
};


const groupChatsByDate = (chats) => {
  const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], 'Older': [] };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  chats.forEach(chat => {
    const chatDate = new Date(chat.timestamp);
    if (chatDate >= today) groups.Today.push(chat);
    else if (chatDate >= yesterday) groups.Yesterday.push(chat);
    else if (chatDate >= sevenDaysAgo) groups['Previous 7 Days'].push(chat);
    else groups.Older.push(chat);
  });
  return groups;
};

// Suggested prompts for the welcome screen
const SUGGESTED_PROMPTS = [
    "Write a Python function for a dynamic array.",
    "Explain the concept of Big O Notation.",
    "Solve the 'Maximum Subarray' problem in C++.",
    "Show a step-by-step example of Merge Sort.",
];


// --- Main FullScreenChat Component ---

const FullScreenChat = () => {
  const [darkMode, setDarkMode] = useState(true); 
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Removed mode state
  const [view, setView] = useState('chat');
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // New state for sidebar toggle

  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // --- useEffects (State Persistence and Chat Management) ---
  
  useEffect(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem('algoMitraChatHistory')) || [];
      savedHistory.sort((a, b) => b.timestamp - a.timestamp);
      setChatHistory(savedHistory);

      const validChats = savedHistory.filter(chat => chat.messages && chat.messages.length > 0);
      
      if (validChats.length > 0) {
        setActiveChatId(validChats[0].id);
      }
      const savedDarkMode = localStorage.getItem('algoMitraDarkMode');
      if (savedDarkMode !== null) {
        setDarkMode(JSON.parse(savedDarkMode));
      }

    } catch (error) { console.error("Failed to parse chat history or dark mode from localStorage", error); }
  }, []);

  useEffect(() => {
    if (chatHistory.length > 0 || localStorage.getItem('algoMitraChatHistory')) {
      localStorage.setItem('algoMitraChatHistory', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);
  
  useEffect(() => {
    localStorage.setItem('algoMitraDarkMode', JSON.stringify(darkMode));
    document.body.className = darkMode ? 'blue-dark-mode' : 'light-mode';
  }, [darkMode]);

  useEffect(() => {
    const activeChat = chatHistory.find(chat => chat.id === activeChatId);
    setMessages(activeChat ? activeChat.messages : []);
  }, [activeChatId, chatHistory]);
  
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { 
    if (inputRef.current) { 
      inputRef.current.style.height = 'auto'; 
      // Limit height to max 5 rows before scrolling
      const maxHeight = parseInt(getComputedStyle(inputRef.current).lineHeight) * 5;
      if (inputRef.current.scrollHeight < maxHeight) {
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      } else {
        inputRef.current.style.height = `${maxHeight}px`;
        inputRef.current.style.overflowY = 'auto';
      }
    } 
  }, [input]);

  // --- API and Handlers ---

  const executeApiCall = async (userMessage) => {
    setLoading(true);
    let currentChatId = activeChatId;
    
    // Fix ReferenceError by using import.meta.env (assuming Vite)
    const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY; 

    if (!GROQ_API_KEY) {
      // ... (API Key error handling remains the same)
      const errorText = "**Configuration Error**\n\nAPI key is missing. Please set VITE_GROQ_API_KEY in your .env file and restart the server.";
      const errorMsg = { from: "bot", text: errorText };
      
      if (!currentChatId) {
        currentChatId = `chat_${Date.now()}`;
        setActiveChatId(currentChatId);
        setChatHistory([{ id: currentChatId, title: "Error", timestamp: Date.now(), messages: [userMessage, errorMsg] }, ...chatHistory]);
      } else {
        setChatHistory(prev => prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, userMessage, errorMsg] }
            : chat
        ));
      }
      setLoading(false);
      return;
    }
    
    // Logic to create new chat or update history
    if (!currentChatId) {
      currentChatId = `chat_${Date.now()}`;
      setActiveChatId(currentChatId);
      const newChat = {
        id: currentChatId,
        title: userMessage.text.substring(0, 35) + (userMessage.text.length > 35 ? '...' : ''),
        timestamp: Date.now(),
        messages: [userMessage, { from: "bot", text: "" }], // Bot placeholder for streaming
      };
      setChatHistory(prev => [newChat, ...prev]);
    } else {
      setChatHistory(prev => prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, messages: [...chat.messages, userMessage, { from: "bot", text: "" }] }
          : chat
      ));
    }

    // Get the updated messages array from the newly set state (using functional update, so we need to derive the recent messages)
    // NOTE: This is complex with setChatHistory being async. A simpler approach is to rebuild the message list locally:
    let tempMessages = messages.length > 0 ? [...messages, userMessage, { from: "bot", text: "" }] : [userMessage, { from: "bot", text: "" }];
    
    // Get up to the last 10 messages for context
    const recentMessages = tempMessages.slice(-10, -1) || [];

    const formattedHistory = [
        { role: 'system', content: getSystemPrompt() }, // No mode passed!
        ...recentMessages.map(msg => ({ role: msg.from === 'user' ? 'user' : 'assistant', content: msg.text }))
    ];

    try {
      // Streamed API call logic
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: formattedHistory, stream: true, temperature: 0.2 }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = '';
      let doneReading = false;
      
      while (!doneReading) {
        const { done, value } = await reader.read();
        if (done) { doneReading = true; break; }

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop(); 

        for (const line of lines) {
            if (line.trim() === '') continue; 
            const { json, done } = parseStreamingLine(line);
            
            if (done) { doneReading = true; break; }

            if (json) {
                const content = json.choices?.[0]?.delta?.content;

                if (content) {
                    setChatHistory(prev => prev.map(chat => {
                        if (chat.id === currentChatId) {
                            const newMessages = [...chat.messages];
                            const lastMessage = newMessages[newMessages.length - 1];
                            const updatedLastMessage = { ...lastMessage, text: lastMessage.text + content };
                            newMessages[newMessages.length - 1] = updatedLastMessage;
                            return { ...chat, messages: newMessages };
                        }
                        return chat;
                    }));
                }
            }
        }
        if (doneReading) break; 
      }
    } catch (error) { 
      console.error("API error", error); 
      const errorText = `**Oops! Something went wrong.**\n\n*Error: ${error.message}*`;
      // Update the last bot message with the error text
      setChatHistory(prev => prev.map(chat => {
        if (chat.id === currentChatId) {
          const newMessages = [...chat.messages];
          const lastMessage = newMessages[newMessages.length - 1];
          const updatedLastMessage = { ...lastMessage, text: lastMessage.text + "\n\n" + errorText };
          newMessages[newMessages.length - 1] = updatedLastMessage;
          return { ...chat, messages: newMessages };
        }
        return chat;
      }));
    } 
    finally { setLoading(false); }
  };

  const handleSendMessage = (messageText) => {
    if (!messageText.trim() || loading) return;
    executeApiCall({ from: "user", text: messageText });
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); 
      handleSendMessage(input);
    }
  };
  
  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]); // Clear messages for the new chat
    setInput("");
    setView('chat');
  };

  const handleLoadChat = (chatId) => {
    setActiveChatId(chatId);
    setView('chat');
    setIsSidebarOpen(false); // Close sidebar on mobile/load
  };
  
  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation();
    setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
    if (activeChatId === chatId) handleNewChat();
  };
  
  // --- Render Components ---
  
  const WelcomeScreen = () => (
    <div className="welcome-screen">
      <div className="welcome-header">
        <div className="welcome-logo-wrapper"><img src={darkMode ? whiteLogo : blackLogo} alt="Logo" /></div>
        <h2>AlgoMITra - Your Coding Assistant</h2>
      </div>
      <p>How can I help you today?</p>
      <div className="suggested-prompts-container">
          {SUGGESTED_PROMPTS.map((prompt, index) => (
              <button key={index} className="suggested-prompt-button" onClick={() => handleSendMessage(prompt)}>
                  {prompt}
              </button>
          ))}
      </div>
    </div>
  );


  const HistoryScreen = () => {
    const groupedChats = groupChatsByDate(chatHistory);
    return (
      <div className="history-screen-full"> 
        <div className="history-list">
          {chatHistory.length === 0 ? (
            <div className="no-history-message">
              <Clock size={48} />
              <h3>No Chat History</h3>
              <p>Your saved conversations will appear here.</p>
            </div>
          ) : (
            Object.entries(groupedChats).map(([groupTitle, chats]) => (
              chats.length > 0 && (
                <div key={groupTitle} className="history-group">
                  <h4 className="history-group-title">{groupTitle}</h4>
                  {chats.map(chat => (
                    <div key={chat.id} className={`history-item ${activeChatId === chat.id ? 'active' : ''}`} onClick={() => handleLoadChat(chat.id)}>
                      <div className="history-item-content">
                        <MessageSquare size={16} className="history-item-icon" />
                        <p className="history-title">{chat.title}</p>
                      </div>
                      <button className="delete-history-btn" title="Delete Chat" onClick={(e) => handleDeleteChat(e, chat.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ))
          )}
        </div>
      </div>
    );
  };

  const MessageBubble = ({ message }) => {
    const [output, setOutput] = useState(null);
    // Placeholder function, actual code execution requires a backend sandbox
    const handleRunCode = () => setOutput(`Code execution output for ${message.text.substring(0, 30)}... (Requires API)`); 
    
    return (
      <ReactMarkdown
        components={{
          code: ({node, inline, className, children, ...props}) => { 
            const match = /language-(\w+)/.exec(className || ''); 
            // Use SyntaxHighlighter for code blocks
            return !inline && match ? ( 
              <div className="code-block-wrapper"> 
                {/* Removed 'Run' button for simplicity, can be added back if backend exists */}
                <SyntaxHighlighter style={dracula} language={match[1]} PreTag="div" {...props}>
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
                {output && <pre className="code-output">{output}</pre>} 
              </div> 
            ) : ( 
              <code className={className} {...props}>{children}</code> 
            ); 
          } 
        }}
      >
        {message.text}
      </ReactMarkdown>
    );
  };
  
  const MessageActions = ({ message }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => { navigator.clipboard.writeText(message.text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
    const handleReadAloud = () => { 
        const utterance = new SpeechSynthesisUtterance(message.text.replace(/\*\*/g, '').replace(/\n/g, ' ')); 
        window.speechSynthesis.speak(utterance); 
    };
    return ( 
      <div className="message-actions">
        <button onClick={handleReadAloud} title="Read aloud"><Volume2 size={16} /></button>
        <button onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>{copied ? "Copied!" : <Copy size={16} />}</button>
      </div> 
    );
  };


  const renderChatContent = () => {
    return (
      <>
        <div className="messages-container-full"> 
          {messages.length === 0 && !loading ? (
            <WelcomeScreen />
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const isGrouped = prev && prev.from === msg.from;
              // Only show avatar on the first message of a group
              const showAvatar = !isGrouped; 

              return (
                <div key={i} className={`message-row ${msg.from} ${isGrouped ? 'is-grouped' : ''}`}>
                  <div className={`avatar-wrapper ${showAvatar ? '' : 'hidden'}`}>
                    {msg.from === 'bot' ? <img src={darkMode ? whiteLogo : blackLogo} alt="Bot"/> : <User size={20}/>}
                  </div>
                  <div className="message-content">
                    <div className={`message-bubble ${msg.from}`}><MessageBubble message={msg} /></div>
                    {msg.from === 'bot' && msg.text && <MessageActions message={msg} />}
                  </div>
                </div>
              );
            })
          )}
          {loading && (
            <div className="message-row bot is-grouped">
              <div className="avatar-wrapper">
                  <img src={darkMode ? whiteLogo : blackLogo} alt="Bot"/>
              </div>
              <div className="message-content">
                  <div className="message-bubble bot typing-indicator">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-area-full"> 
          
          <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }} className="chat-input-form">
            <textarea 
              ref={inputRef} 
              rows={1} 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown} 
              disabled={loading} 
              placeholder="Ask me about algorithms..." 
            />
            <button type="submit" disabled={!input.trim() || loading} className="send-button" title="Send"><Send size={20} /></button>
          </form>
          <div className="input-footer">
              <p>AlgoMITra uses Llama 3.1 8B via Groq API. Code may contain bugs.</p>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={`full-screen-container ${darkMode ? 'blue-dark-mode' : 'light-mode'} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      
      {/* Sidebar with Toggle */}
      <div className="full-screen-sidebar">
        <div className="sidebar-header">
          <img src={darkMode ? whiteLogo : blackLogo} alt="Logo" style={{ width: '30px', height: '30px' }}/>
          <h1>AlgoMITra</h1>
        </div>
        
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: view === 'history' ? 'hidden' : 'auto' }}>
            <PageTabs 
                onNewChat={handleNewChat} 
                view={view} 
                setView={setView} 
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
            />
            {view === 'history' && <HistoryScreen />}
        </div>
        
        <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
      </div>

      {/* Main Content */}
      <div className="full-screen-main-content">
        <div className="full-screen-header">
            <button className="sidebar-open-btn" onClick={() => setIsSidebarOpen(true)} title="Open Sidebar">
                <Zap size={20}/>
            </button>
          <div className="header-title">
            <img src={darkMode ? whiteLogo : blackLogo} alt="Logo" style={{ width: '25px', height: '25px', marginRight: '8px' }}/>
            <span>MITra Chat</span>
          </div>
            {/* Removed mode indicator */}
        </div>
        {view === 'chat' ? renderChatContent() : null}
      </div>
    </div>
  );
};

export default FullScreenChat;