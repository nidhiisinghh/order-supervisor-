import json
from groq import Groq
from app.config import GROQ_API_KEY

def classify_event_sync(event_name: str, event_payload: dict, memory_summary: str, wake_up_guidance: str) -> tuple:
    """
    Synchronous classifier call.
    Returns: (should_wake: bool, reasoning: str)
    """
    if not GROQ_API_KEY:
        return True, "GROQ_API_KEY not configured. Waking up for safety."

    # Force immediate wake-up for critical lifecycle and communication events
    critical_events = {
        "payment_failed",
        "refund_requested",
        "customer_message_received",
        "shipment_delayed",
        "delivered"
    }
    if event_name in critical_events:
        return True, f"Critical event '{event_name}' forces immediate supervisor wake-up."

    # Standard system check for initialization or completion recommendations
    if event_name in ["order_created"]:
        return True, "Order creation event initialized. Waking up to set starting state."

    client = Groq(api_key=GROQ_API_KEY)

    system_prompt = (
        "You are a precise routing classifier for an Order Supervisor AI system. "
        "All currency, price, and money values throughout the reasoning must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n"
        "You must output ONLY valid JSON. Your response must match this structure exactly:\n"
        "{\n"
        '  "should_wake": true,\n'
        '  "reasoning": "Detailed explanation here."\n'
        "}"
    )

    user_prompt = f"""Analyze the new event and decide if it warrants waking up the main Order Supervisor agent.
Routine events that do not require action can wait until the next scheduled check-in.

---
CURRENT MEMORY SUMMARY:
{memory_summary or "No memory yet."}

CURRENT WAKE-UP GUIDANCE FROM MAIN AGENT:
{wake_up_guidance or "Wake up on any significant changes or customer problems."}

NEW EVENT RECEIVED:
- Event Name: {event_name}
- Event Payload: {json.dumps(event_payload)}
---

Determine if we should wake the main agent (should_wake = true) or remain asleep (should_wake = false).
"""

    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=150
        )
        data = json.loads(response.choices[0].message.content)
        should_wake = bool(data.get("should_wake", True))
        reasoning = str(data.get("reasoning", "Decided by LLM classifier."))
        return should_wake, reasoning
    except Exception as e:
        print(f"Error in LLM event classification: {e}")
        # Default to True on errors for safety
        return True, f"Classifier experienced an error: {str(e)}. Defaulting to wake-up."
