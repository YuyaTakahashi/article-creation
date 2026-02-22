import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wpLink, docUrl } = body;

        // Ensure we have something to delete
        if (!wpLink && !docUrl) {
            return NextResponse.json({ message: "Nothing to delete" }, { status: 200 });
        }

        const gasEndpoint = process.env.NEXT_PUBLIC_GAS_WEBAPP_URL;
        if (!gasEndpoint) {
            console.warn("GAS WebApp URL is not configured. Cannot trigger remote deletion.");
            return NextResponse.json({ error: "GAS endpoint not configured" }, { status: 500 });
        }

        const payload = {
            action: 'delete',
            wpLink: wpLink,
            docUrl: docUrl
        };

        const response = await fetch(gasEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("GAS Delete API Error:", errorData);
            return NextResponse.json({ error: "Failed to connect to GAS API" }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
