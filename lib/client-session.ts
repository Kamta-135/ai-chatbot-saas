// Har browser/visitor ko ek alag, random "session ID" deta hai (localStorage mein save hoti
// hai, permanently us browser ke liye). Login/password nahi hai — bas itna kaafi hai taaki
// har visitor ka apna chat history aur apne uploaded documents alag rahe, dusre visitors se
// mix na hon. Pehle koi bhi session ID nahi thi, isliye SAARE visitors ka data ek hi jagah
// (poore app mein shared) store ho raha tha — koi bhi /history khol ke sabki chat dekh sakta
// tha, aur ek user ka upload dusre ke jawabon mein use ho sakta tha.
const STORAGE_KEY = "ai_chatbot_session_id";

export function getSessionId(): string {
    if (typeof window === "undefined") return "";

    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
}
