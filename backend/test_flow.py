import json
import time
import requests

BACKEND_URL = "http://localhost:8000"
ORDER_ID = "ORD-TEST-555"
RUN_ID = f"order-supervisor-{ORDER_ID}"

def run_verification():
    print("==================================================")
    # 1. Fetch templates
    print("1. Fetching supervisor templates...")
    res = requests.get(f"{BACKEND_URL}/api/supervisors")
    if not res.ok:
        print(f"Error fetching templates: {res.text}")
        return
    
    supervisors = res.json()
    if not supervisors:
        print("No supervisor templates found!")
        return
    
    supervisor_id = supervisors[0]["id"]
    print(f"Found supervisor template: '{supervisors[0]['name']}' (ID: {supervisor_id})")

    # 2. Start a run
    print(f"\n2. Starting run for Order ID: {ORDER_ID}...")
    start_payload = {
        "supervisor_id": supervisor_id,
        "order_id": ORDER_ID,
        "initial_instructions": "Prioritize rapid responses. If delayed, message logistics."
    }
    res = requests.post(f"{BACKEND_URL}/api/runs", json=start_payload)
    if not res.ok:
        print(f"Error starting run: {res.text}")
        return
    
    run_info = res.json()
    print(f"Run started. Status: {run_info['status']}")
    print("Sleeping 5 seconds for initial agent thought process...")
    time.sleep(5)

    # 3. Inject routine event (payment_confirmed) - Classifier should NOT wake agent
    print(f"\n3. Injecting routine event: 'payment_confirmed'...")
    event_payload = {
        "name": "payment_confirmed",
        "payload": {
            "amount": 199.99,
            "status": "success",
            "gateway": "stripe"
        }
    }
    res = requests.post(f"{BACKEND_URL}/api/runs/{RUN_ID}/events", json=event_payload)
    print(f"Injection status: {res.status_code}")
    print("Sleeping 5 seconds for classifier assessment...")
    time.sleep(5)

    # 4. Inject critical event (shipment_delayed) - Classifier SHOULD wake agent
    print(f"\n4. Injecting critical event: 'shipment_delayed'...")
    delay_payload = {
        "name": "shipment_delayed",
        "payload": {
            "carrier": "FedEx",
            "delay_hours": 36,
            "reason": "sorting_facility_exception"
        }
    }
    res = requests.post(f"{BACKEND_URL}/api/runs/{RUN_ID}/events", json=delay_payload)
    print(f"Injection status: {res.status_code}")
    print("Sleeping 6 seconds for routing decision and agent actions...")
    time.sleep(6)

    # 5. Add a manual custom run instruction - Wakes agent instantly
    print(f"\n5. Injecting custom instruction: 'Message customer apologizing for delay.'...")
    instruction_payload = {
        "text": "Message customer apologizing for delay."
    }
    res = requests.post(f"{BACKEND_URL}/api/runs/{RUN_ID}/instructions", json=instruction_payload)
    print(f"Instruction status: {res.status_code}")
    print("Sleeping 6 seconds for agent to act on human instruction...")
    time.sleep(6)

    # 6. Inject terminal event (delivered) - Triggers end-of-run summarizer
    print(f"\n6. Injecting terminal event: 'delivered'...")
    delivered_payload = {
        "name": "delivered",
        "payload": {
            "status": "delivered_at_door",
            "signed_by": "John Doe",
            "timestamp": "2026-08-10T19:00:00Z"
        }
    }
    res = requests.post(f"{BACKEND_URL}/api/runs/{RUN_ID}/events", json=delivered_payload)
    print(f"Injection status: {res.status_code}")
    print("Sleeping 10 seconds for graceful workflow shutdown and final report compilation...")
    time.sleep(10)

    # 7. Fetch final state and timeline
    print("\n7. Fetching final run details...")
    res = requests.get(f"{BACKEND_URL}/api/runs/{RUN_ID}")
    final_run = res.json()
    print(f"Final Run Status: {final_run['status']}")
    print(f"Memory: {final_run['memory_summary']}")
    
    if final_run.get("final_summary"):
        print("\n=== FINAL GENERATED SUMMARY REPORT ===")
        print(f"SUMMARY: {final_run['final_summary'].get('summary')}")
        print(f"ACTIONS TAKEN: {final_run['final_summary'].get('actions_taken')}")
        print(f"LEARNINGS: {final_run['final_summary'].get('learnings')}")
        print(f"RECOMMENDATIONS: {final_run['final_summary'].get('recommendations')}")
        print("=======================================")

    print("\n=== COMPLETE RUN CHRONOLOGICAL TIMELINE ===")
    res_timeline = requests.get(f"{BACKEND_URL}/api/runs/{RUN_ID}/timeline")
    timeline = res_timeline.json()
    
    for idx, act in enumerate(timeline):
        print(f"[{idx+1}] [{act['timestamp']}] {act['type'].upper()} - {act['name']}")
        if act['type'] == 'classifier_decision':
            print(f"    -> DECISION: Wake={act['payload'].get('should_wake')} | Reason: {act['payload'].get('reasoning')}")
        elif act['type'] == 'agent_reasoning':
            print(f"    -> THOUGHT: {act['payload'].get('reasoning')[:200]}...")
        elif act['type'] == 'tool_execution':
            print(f"    -> ACTION: {act['name']}({json.dumps(act['payload'])})")
        elif act['type'] == 'manual_instruction':
            print(f"    -> HUMAN INSTRUCTION: {act['payload'].get('text')}")
        elif act['type'] == 'system_event':
            print(f"    -> EVENT: {json.dumps(act['payload'])}")
    print("==================================================")

if __name__ == "__main__":
    run_verification()
