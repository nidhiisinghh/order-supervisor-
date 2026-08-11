import json
from groq import Groq
from app.config import GROQ_API_KEY

def run_agent_step_sync(
    model_choice: str,
    base_instruction: str,
    run_instructions: list,
    memory_summary: str,
    recent_activities: list,
    available_actions: list
) -> dict:
    """
    Synchronous main agent reasoning step.
    Returns a dict containing: reasoning, actions, new_memory_summary, new_wake_up_guidance, sleep_duration_seconds.
    """
    if not GROQ_API_KEY:
        return {
            "reasoning": "GROQ_API_KEY not configured. Cannot perform reasoning.",
            "actions": [],
            "new_memory_summary": memory_summary or "Initializing order state.",
            "new_wake_up_guidance": "Waking on any event due to lack of API key.",
            "sleep_duration_seconds": 1800
        }

    valid_models = {
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.1-70b-versatile",
        "llama3-70b-8192"
    }
    if model_choice in ["llama3-70b-8192", "llama-3.1-70b-versatile"]:
        model = "llama-3.3-70b-versatile"
    else:
        model = model_choice if model_choice in valid_models else "llama-3.3-70b-versatile"

    client = Groq(api_key=GROQ_API_KEY)

    system_prompt = (
        "You are the Main Reasoning Agent for an Order Supervisor AI system. "
        "Your task is to review the order's state, custom instructions, and history, "
        "and determine what actions to take. You must output ONLY a valid JSON object matching this structure:\n"
        "{\n"
        '  "reasoning": "A concise text explaining your current reasoning.",\n'
        '  "actions": [\n'
        '    {"name": "action_name", "args": {"message": "Message to send or log"}}\n'
        '  ],\n'
        '  "new_memory_summary": "An updated, high-level compact summary of the order history and state.",\n'
        '  "new_wake_up_guidance": "Detailed guidance for the classifier on which future events should trigger an immediate wake-up.",\n'
        '  "sleep_duration_seconds": 3600\n'
        "}\n\n"
        "IMPORTANT: All currency, price, and money values throughout the project must be represented in Indian currency (Rupees, using the ₹ symbol or INR). Never use dollars ($) or other currencies.\n\n"
        "Available actions you may call: " + ", ".join(available_actions) + ".\n"
        "Do not invoke any action not in the available actions list. If no actions are needed, return an empty actions array.\n"
        "Ensure sleep_duration_seconds is an integer (default to 3600 or as needed; set to 0 if you want to check back immediately)."
    )

    # Format history and instructions for the prompt
    formatted_instructions = "\n".join([f"- {instr}" for instr in run_instructions])
    
    formatted_activities = ""
    for act in recent_activities:
        payload_str = json.dumps(act.get("payload")) if act.get("payload") else ""
        formatted_activities += f"[{act.get('timestamp')}] {act.get('type').upper()} - {act.get('name')}: {payload_str[:200]}\n"

    user_prompt = f"""Review the following order status and execute the next logical step.

---
SUPERVISOR BASE INSTRUCTION:
{base_instruction}

RUN-SPECIFIC CUSTOM INSTRUCTIONS (THESE OVERRIDE BASE INSTRUCTIONS IF CONFLICTING):
{formatted_instructions or "No additional instructions."}

CURRENT COMPACT MEMORY:
{memory_summary or "No memory yet. Just starting."}

RECENT ACTIVITY LOG (CHRONOLOGICAL):
{formatted_activities or "No activities recorded."}

AVAILABLE BUSINESS ACTIONS:
{json.dumps(available_actions)}
---

Decide what to do. Generate the required JSON output now.
"""

    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model,
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1000
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Validate that actions returned are in the allowed list
        filtered_actions = []
        for action in result.get("actions", []):
            action_name = action.get("name")
            if action_name in available_actions:
                filtered_actions.append(action)
            else:
                print(f"Skipping unauthorized action: {action_name}")
        
        result["actions"] = filtered_actions
        return result
    except Exception as e:
        print(f"Error in Main Agent reasoning step: {e}")
        return {
            "reasoning": f"Agent runtime error: {str(e)}",
            "actions": [],
            "new_memory_summary": memory_summary or "State preserved due to error.",
            "new_wake_up_guidance": "Wake up on next event.",
            "sleep_duration_seconds": 600
        }
