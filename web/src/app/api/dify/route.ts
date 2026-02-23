import { NextResponse } from "next/server";

export const maxDuration = 300; // max 5 minutes if deployed

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Dify API Endpoint
        const endpoint = `${process.env.NEXT_PUBLIC_DIFY_API_URL}/chat-messages`;

        const payload = {
            inputs: {
                topic: body.topic,
                Target_Difficulty: body.difficulty ?? 0.5,
                Target_IT_Literacy: body.literacy ?? 0.5,
                mail: body.mail || "",
                Target_Task_ID: body.taskId || "",
            },
            query: body.context || "特になし",
            response_mode: "streaming", // Enable streaming
            user: "ux-glossary-web-user",
        };

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.DIFY_API_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Dify API Error:", errorData);
            return NextResponse.json({ error: "Failed to connect to Dify API" }, { status: response.status });
        }

        // Forward the Dify SSE stream directly to the client
        return new Response(response.body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
