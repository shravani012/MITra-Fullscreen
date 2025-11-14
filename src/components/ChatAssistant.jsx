import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, PlusSquare, Volume2, Copy, MessageSquare, User, Settings, Clock, Trash2, Sun, Moon } from "react-feather";

// Ensure this matches the name of your CSS file
import './ChatAssistant.css';

// --- Utility Function for Robust Streaming ---

/**
 * Safely parses a single line of streaming text data (SSE format).
 * @param {string} line - A single line from the raw stream buffer.
 * @returns {{json: object | null, done: boolean}} - The parsed JSON chunk or null, and a flag indicating stream completion.
 */
const parseStreamingLine = (line) => {
	const trimmedLine = line.trim();

	if (trimmedLine === 'data: [DONE]') {
		return { json: null, done: true };
	}

	if (trimmedLine.startsWith('data: ')) {
		const jsonString = trimmedLine.substring(6);
		try {
			const json = JSON.parse(jsonString);
			return { json, done: false };
		} catch (e) {
			// This case handles malformed JSON which shouldn't happen with single lines, 
			// but is a good safeguard.
			console.warn("Could not parse JSON from streaming line:", jsonString, e);
			return { json: null, done: false };
		}
	}
	return { json: null, done: false };
};


// --- Component Fragments ---

const getSystemPrompt = (mode) => `You are AlgoMITra, an AI tutor. Your behavior depends on the user's CURRENT message.
// Modes: 'conceptual', 'step by step', 'optimized'.

// CORE DIRECTIVE: You are strictly an AI tutor for algorithms, data structures, and programming concepts.
// If the user's message is NOT technical (e.g., about history, cooking, weather, or current events),
// you MUST politely decline and ask them to keep the topic focused on technical subjects.
// Example decline: "I'm only trained to help with algorithms and programming. Please ask a technical question!"

// You must analyze the user's request:
// 1. If the user asks for a new problem/solution (e.g., "Write a Python function to check for balanced parentheses"), provide the solution in the currently selected mode:
//    - Conceptual: Give a high-level explanation of the logic.
//    - Step by Step: Give the complete, final code/solution immediately. **DO NOT provide hints (Hint 1, Hint 2, etc.).**
//    - Optimized: Give a single, highly efficient code solution.
// 2. If the user uses a control phrase ("I will try to solve it", "Give me another hint", "Give me the final solution"), treat it as a new question or politely explain the tutor provides full solutions in this mode.

**General Style:** Always be encouraging and direct. Do not mention the mode unless giving the final answer.`;

const PageTabs = ({ onNewChat, view, setView }) => {
	return (
		<div className="chat-tabs">
			<button onClick={onNewChat} className="tab-button" title="New Chat"><PlusSquare size={20} /></button>
			<button onClick={() => setView('history')} className={`tab-button ${view === 'history' ? 'active' : ''}`} title="History"><Clock size={20} /></button>
			<div className="tab-spacer"></div>
			<button className="tab-button" title="Settings (coming soon)"><Settings size={20} /></button>
		</div>
	);
};

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


// --- Main FullScreenChat Component ---

const FullScreenChat = () => {
	const [darkMode, setDarkMode] = useState(true);
	const [messages, setMessages] = useState([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [mode, setMode] = useState('');
	const [view, setView] = useState('chat');
	const [chatHistory, setChatHistory] = useState([]);
	const [activeChatId, setActiveChatId] = useState(null);
	
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
	}, [darkMode]);

	useEffect(() => {
		const activeChat = chatHistory.find(chat => chat.id === activeChatId);
		setMessages(activeChat ? activeChat.messages : []);
	}, [activeChatId, chatHistory]);
	
	useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
	useEffect(() => { 
		if (inputRef.current) { 
			inputRef.current.style.height = 'auto'; 
			inputRef.current.style.height = `${inputRef.current.scrollHeight}px`; 
		} 
	}, [input]);

	// --- API and Handlers ---

	const executeApiCall = async (userMessage) => {
		setLoading(true);
		let currentChatId = activeChatId;
		let updatedHistory;

		const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

		if (!GROQ_API_KEY) {
			const errorText = "**Configuration Error**\n\nAPI key is missing. Please set VITE_GROQ_API_KEY in your .env file and restart the server.";
			const errorMsg = { from: "bot", text: errorText };
			
			if (!currentChatId) {
			currentChatId = `chat_${Date.now()}`;
			setActiveChatId(currentChatId);
			const newChat = {
				id: currentChatId,
				title: userMessage.text.substring(0, 35) + (userMessage.text.length > 35 ? '...' : ''),
				timestamp: Date.now(),
				messages: [userMessage, { from: "bot", text: errorText }], // Directly add error to bot message
			};
			updatedHistory = [newChat, ...chatHistory];
		} else {
			updatedHistory = chatHistory.map(chat =>
				chat.id === currentChatId
					? { ...chat, messages: [...chat.messages, userMessage, { from: "bot", text: errorText }] }
					: chat
			);
		}
		setChatHistory(updatedHistory);
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
			updatedHistory = [newChat, ...chatHistory];
		} else {
			updatedHistory = chatHistory.map(chat =>
				chat.id === currentChatId
					? { ...chat, messages: [...chat.messages, userMessage, { from: "bot", text: "" }] }
					: chat
			);
		}
		setChatHistory(updatedHistory);
		
		// Get up to the last 10 messages for context
		const activeChatMessages = updatedHistory.find(chat => chat.id === currentChatId)?.messages;
		// Slice(-10, -1) takes the last 9 messages before the current user message
		const recentMessages = activeChatMessages?.slice(-10, -1) || []; 

		const formattedHistory = [
				{ role: 'system', content: getSystemPrompt(mode) },
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
			let streamBuffer = ''; // Crucial: Buffer for incomplete Server-Sent Events (SSE) lines
			let doneReading = false;
			
			while (!doneReading) {
				const { done, value } = await reader.read();
				if (done) {
						doneReading = true;
						break; 
				}

				// Append the new chunk to the buffer
				streamBuffer += decoder.decode(value, { stream: true });

				// Process the buffer line by line
				const lines = streamBuffer.split('\n');
				// Keep the potentially incomplete last line in the buffer for the next read
				streamBuffer = lines.pop(); 

				for (const line of lines) {
						if (line.trim() === '') continue; // Skip empty lines

						const { json, done } = parseStreamingLine(line); // Uses the utility function
						
						if (done) {
								doneReading = true;
								break; // Exit the for loop
						}

						if (json) {
								const content = json.choices?.[0]?.delta?.content;

								if (content) {
										// Use functional update to ensure we are operating on the latest state
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
				if (doneReading) break; // Exit the while loop if done was set inside the for loop
			}
		} catch (error) {
			console.error("API error", error); 
			const errorText = `**Oops! Something went wrong.**\n\n*Error: ${error.message}*`;
			// Update the last bot message with the error text
			setChatHistory(prev => prev.map(chat => {
				if (chat.id === currentChatId) {
					const newMessages = [...chat.messages];
					const lastMessage = newMessages[newMessages.length - 1];
					// Ensure we don't overwrite any successfully streamed text, just append the error
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
	};
	
	const handleDeleteChat = (e, chatId) => {
		e.stopPropagation();
		setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
		if (activeChatId === chatId) handleNewChat();
	};
	
	// --- Render Components (Adapted for Full Screen) ---
	
	const WelcomeScreen = () => (
		<div className="welcome-screen">
			<div className="welcome-header">
				<div className="welcome-logo-wrapper"><span style={{ fontSize: '50px', lineHeight: '1', display: 'inline-block' }}>&lt; /&gt;</span></div> {/* Literal < /> as logo */}
				<h2>MITra</h2>
			</div>
			<p>How can I help you today?</p>
			
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
						return !inline && match ? ( 
							<div style={{position: 'relative'}}> 
								<button onClick={handleRunCode} className="run-code-button">Run</button> 
								<pre className={className} {...props}>{String(children).replace(/\n$/, '')}</pre> 
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
				<button onClick={handleReadAloud} title="Read aloud"><Volume2 size={14} /></button>
				<button onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>{copied ? "Copied!" : <Copy size={14} />}</button>
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
							return (
								<div key={i} className={`message-row ${msg.from} ${isGrouped ? 'is-grouped' : ''}`}>
									<div className="avatar">
										{/* Bot avatar uses MessageSquare, User avatar uses User icon */}
										{msg.from === 'bot' ? <MessageSquare size={20}/> : <User size={20}/>}
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
							<div className="avatar"><MessageSquare size={20}/></div> {/* Bot avatar placeholder */}
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
					<div className="input-toolbar">
						<div className="toolbar-group">
							
						</div>
					</div>
					
					{/* Removed Action Buttons (no hint logic) */}

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
				</div>
			</>
		);
	};

	return (
		<div className={`full-screen-container ${darkMode ? 'dark-mode' : 'light-mode'}`}>
			<div className="full-screen-sidebar">
				<div className="sidebar-header">
					{/* Literal < /> as logo */}
					<span style={{ fontSize: '30px', lineHeight: '1', marginRight: '8px', display: 'inline-block' }}>&lt; /&gt;</span>
					<h1>MITra</h1>
				</div>
				
				{/* Sidebar content container (PageTabs, HistoryScreen) */}
				<div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: view === 'history' ? 'hidden' : 'auto' }}>
						<PageTabs onNewChat={handleNewChat} view={view} setView={setView} />
						{view === 'history' && <HistoryScreen />}
				</div>
				
				{/* Dark Mode Toggle fixed at the bottom */}
				<DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />

			</div>
			<div className="full-screen-main-content">
				<div className="full-screen-header">
					<div className="header-title">
						{/* Literal < /> as logo */}
						<span style={{ fontSize: '25px', lineHeight: '1', marginRight: '8px', display: 'inline-block' }}>&lt; /&gt;</span>
						<span>MITra</span>
					</div>
					{/* Render a placeholder for chat title/mode if in chat view */}
					{view === 'chat' && (
							<div className="header-info">
								<span className={`chat-mode-indicator ${mode.replace(/\s/g, '-')}`}>{mode.toUpperCase()}</span>
							</div>
					)}
				</div>
				{view === 'chat' ? renderChatContent() : null}
			</div>
		</div>
	);
};

export default FullScreenChat;