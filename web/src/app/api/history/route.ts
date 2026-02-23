import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEBAPP_URL;

export async function GET(request: Request) {
    try {
        const response = await fetch(GAS_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_history" }),
        });

        if (!response.ok) {
            console.error(`GAS GET HTTP error: ${response.status}`, await response.text());
            throw new Error(`GAS HTTP error! status: ${response.status}`);
        }

        const rawText = await response.text();
        console.log("GAS GET Raw Response:", rawText);
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            console.error("Failed to parse GAS GET JSON:", rawText);
            throw new Error("Invalid JSON from GAS");
        }
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Next.js GET API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Check if this is a save, update, or delete action
        const payload = {
            action: body.action || "save_history", // save_history, update_history, delete_history
            ...body
        };

        const response = await fetch(GAS_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`GAS POST HTTP error: ${response.status}`, await response.text());
            throw new Error(`GAS HTTP error! status: ${response.status}`);
        }

        const rawText = await response.text();
        console.log("GAS POST Raw Response:", rawText);
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            console.error("Failed to parse GAS POST JSON:", rawText);
            throw new Error("Invalid JSON from GAS");
        }
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Next.js POST API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
