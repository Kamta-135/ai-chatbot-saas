"use client";

import { useEffect, useState } from "react";

type ChatRow = {
    id: number;
    role: "user" | "assistant";
    content: string;
    created_at: string;
};

type Pair = {
    id: number;
    question: string;
    answer: string;
    created_at: string;
};

export default function HistoryPage() {
    const [pairs, setPairs] = useState<Pair[]>([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState<number | null>(null);

    useEffect(() => {
        fetch("/api/chat/history")
            .then((res) => res.json())
            .then((data: ChatRow[]) => {
                const grouped: Pair[] = [];
                for (let i = 0; i < data.length; i++) {
                    if (data[i].role === "user") {
                        const userRow = data[i];
                        const assistantRow = data[i + 1]?.role === "assistant" ? data[i + 1] : null;
                        grouped.push({
                            id: userRow.id,
                            question: userRow.content,
                            answer: assistantRow?.content || "",
                            created_at: userRow.created_at,
                        });
                        if (assistantRow) i++;
                    }
                }
                setPairs(grouped.reverse());
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="p-6 text-gray-500">Loading history...</div>;
    }

    if (pairs.length === 0) {
        return <div className="p-6 text-gray-500">Koi chat history nahi mili.</div>;
    }

    return (
        <div className="max-w-2xl mx-auto p-4 space-y-3">
            <h1 className="text-xl font-semibold mb-4">Chat History</h1>

            {pairs.map((pair) => {
                const isOpen = openId === pair.id;
                return (
                    <div
                        key={pair.id}
                        onClick={() => setOpenId(isOpen ? null : pair.id)}
                        className="border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow bg-white"
                    >
                        <div className="text-xs text-gray-400 mb-1">
                            {new Date(pair.created_at).toLocaleString()}
                        </div>

                        <p className="font-medium text-gray-900 mb-1 line-clamp-1">
                            {pair.question}
                        </p>

                        <p
                            className={`text-sm text-gray-600 whitespace-pre-wrap ${isOpen ? "" : "line-clamp-3"
                                }`}
                        >
                            {pair.answer || "..."}
                        </p>

                        <span className="text-xs text-blue-500 mt-1 inline-block">
                            {isOpen ? "Kam dikhao ▲" : "Pura padho ▼"}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}