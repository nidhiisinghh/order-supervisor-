"use client";

import { useEffect, useState, useRef } from "react";
import Header from "@/components/Header";
import { 
  Play, Pause, Trash2, Send, Plus, 
  RefreshCw, Clipboard, Activity as ActivityIcon, 
  MessageSquare, HelpCircle, CheckCircle2, AlertOctagon,
  Calendar, Layers, Terminal, MoreHorizontal, Lock
} from "lucide-react";

interface Run {
  id: string;
  supervisor_id: string;
  order_id: string;
  status: string;
  memory_summary: string;
  next_wakeup_time: string | null;
  final_summary: {
    summary: string;
    actions_taken: string;
    learnings: string;
    recommendations: string;
  } | null;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  run_id: string;
  type: string;
  name: string;
  payload: any;
  timestamp: string;
}

interface Supervisor {
  id: string;
  name: string;
}

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Start Run Form state
  const [showStartModal, setShowStartModal] = useState(false);
  const [newOrderId, setNewOrderId] = useState("");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [initialInstruction, setInitialInstruction] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);

  // Event injection state
  const [selectedEvent, setSelectedEvent] = useState("payment_confirmed");
  const [eventPayload, setEventPayload] = useState('{\n  "amount": 1499.00,\n  "gateway": "razorpay"\n}');
  const [injecting, setInjecting] = useState(false);

  // Mid-run instruction state
  const [newInstruction, setNewInstruction] = useState("");
  const [sendingInstruction, setSendingInstruction] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // More actions dropdown menu state
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const backendUrl = "http://localhost:8000";
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const formatCurrencyString = (str: string | null | undefined): string => {
    if (!str) return "";
    return str.replace(/\$/g, "₹");
  };

  const parseUTCDate = (dateStr: string | null | undefined): Date => {
    if (!dateStr) return new Date();
    if (dateStr.endsWith("Z")) return new Date(dateStr);
    const timePart = dateStr.split("T")[1] || "";
    const hasTimezone = timePart.includes("+") || timePart.includes("-") || timePart.includes("Z");
    return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
  };

  // Predefined Simulator Events
  const simulatorEvents = [
    { name: "payment_confirmed", label: "Payment Confirmed (No Wake)", defaultPayload: '{\n  "amount": 1499.00,\n  "status": "success"\n}' },
    { name: "payment_failed", label: "Payment Failed (Wake)", defaultPayload: '{\n  "error_code": "insufficient_funds",\n  "attempts": 1\n}' },
    { name: "shipment_created", label: "Shipment Created (No Wake)", defaultPayload: '{\n  "carrier": "DHL",\n  "tracking_number": "TRK-987410"\n}' },
    { name: "shipment_delayed", label: "Shipment Delayed (Wake)", defaultPayload: '{\n  "carrier": "DHL",\n  "delay_hours": 48,\n  "reason": "bad_weather"\n}' },
    { name: "customer_message_received", label: "Customer Msg Received (Wake)", defaultPayload: '{\n  "message": "Can I upgrade my shipping option? Need this urgently."\n}' },
    { name: "delivered", label: "Delivered (Terminal - Wake)", defaultPayload: '{\n  "signature": "Received by guard",\n  "timestamp": "2026-08-11T12:00:00Z"\n}' },
    { name: "refund_requested", label: "Refund Requested (Terminal - Wake)", defaultPayload: '{\n  "reason": "incorrect_item",\n  "refund_amount": 1499.00\n}' },
    { name: "no_update_for_n_hours", label: "No Update For 24h (No Wake)", defaultPayload: '{\n  "elapsed_hours": 24\n}' }
  ];

  // Fetch initial configs
  useEffect(() => {
    fetchSupervisors();
    fetchRuns(true);
  }, []);

  // Set selected run detailed object when list updates
  useEffect(() => {
    if (selectedRunId) {
      const match = runs.find(r => r.id === selectedRunId);
      if (match) setSelectedRun(match);
    } else {
      setSelectedRun(null);
    }
  }, [runs, selectedRunId]);

  // Handle Polling
  useEffect(() => {
    if (selectedRunId) {
      fetchTimeline(selectedRunId);
      
      // Start 3 second polling
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(() => {
        fetchRuns(false);
        fetchTimeline(selectedRunId);
      }, 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedRunId]);

  // Update event payload field on dropdown select
  useEffect(() => {
    const matched = simulatorEvents.find(e => e.name === selectedEvent);
    if (matched) {
      setEventPayload(matched.defaultPayload);
    }
  }, [selectedEvent]);

  // Auto-dismiss toast notification after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSupervisors = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/supervisors`);
      if (res.ok) {
        const data = await res.json();
        setSupervisors(data);
        if (data.length > 0) setSelectedSupervisorId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load supervisors", err);
    }
  };

  const fetchRuns = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/runs`);
      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();
      setRuns(data);
      setError("");
    } catch (err: any) {
      setError("Unable to connect to the backend server. Make sure it is running.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchTimeline = async (runId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/runs/${runId}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error("Timeline load error", err);
    }
  };

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderId || !selectedSupervisorId) {
      setStartError("Order ID and Supervisor Template are required.");
      return;
    }

    setStarting(true);
    setStartError("");

    try {
      const res = await fetch(`${backendUrl}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisor_id: selectedSupervisorId,
          order_id: newOrderId,
          initial_instructions: initialInstruction || null
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to start supervisor workflow");
      }

      const newRun = await res.json();
      setShowStartModal(false);
      setNewOrderId("");
      setInitialInstruction("");
      await fetchRuns(true);
      setSelectedRunId(newRun.id);
    } catch (err: any) {
      setStartError(err.message || "An error occurred starting the run");
    } finally {
      setStarting(false);
    }
  };

  const handleControl = async (action: "pause" | "resume" | "terminate") => {
    if (!selectedRunId) return;
    const endpoint = action === "pause" ? "interrupt" : action;
    const actionLabel = action === "pause" ? "Interrupted (paused)" : action === "resume" ? "Resumed" : "Terminated";
    try {
      const res = await fetch(`${backendUrl}/api/runs/${selectedRunId}/${endpoint}`, {
        method: "POST"
      });
      if (res.ok) {
        setToast({ message: `Workflow successfully ${actionLabel.toLowerCase()}.`, type: "success" });
        fetchRuns(false);
      } else {
        setToast({ message: `Failed to execute: ${action}`, type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Network connection error.", type: "error" });
    }
  };

  const handleDeleteRun = async (run: Run) => {
    const statusLabel = run.status === "completed" ? "completed" : "terminated";
    const isConfirm = window.confirm(
      `Delete this ${statusLabel} run?\n\nThis will permanently remove the run and its activity history.`
    );
    if (!isConfirm) return;
    try {
      const res = await fetch(`${backendUrl}/api/runs/${run.id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setToast({ message: "Run deleted", type: "success" });
        setSelectedRunId(null);
        setSelectedRun(null);
        setTimeline([]);
        fetchRuns(false);
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data.detail || "Failed to delete run.";
        setToast({ message: errorMsg, type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Network connection error.", type: "error" });
    }
  };

  const handleSendInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId || !newInstruction) return;

    setSendingInstruction(true);
    try {
      const res = await fetch(`${backendUrl}/api/runs/${selectedRunId}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newInstruction })
      });
      if (res.ok) {
        setToast({ message: "Instruction injected successfully.", type: "success" });
        setNewInstruction("");
        fetchTimeline(selectedRunId);
      } else {
        setToast({ message: "Failed to send instruction.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Network connection error.", type: "error" });
    } finally {
      setSendingInstruction(false);
    }
  };

  const handleInjectEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId) return;

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(eventPayload);
    } catch (err) {
      setToast({ message: "Invalid JSON payload.", type: "error" });
      return;
    }

    setInjecting(true);
    try {
      const res = await fetch(`${backendUrl}/api/runs/${selectedRunId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEvent,
          payload: parsedPayload
        })
      });
      if (res.ok) {
        setToast({ message: `Event "${formatText(selectedEvent)}" successfully injected!`, type: "success" });
        fetchTimeline(selectedRunId);
      } else {
        setToast({ message: "Failed to inject event.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Network connection error.", type: "error" });
    } finally {
      setInjecting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 font-mono tracking-wider">RUNNING</span>;
      case "paused":
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60 font-mono tracking-wider">PAUSED</span>;
      case "completed":
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 font-mono tracking-wider">RESOLVED</span>;
      case "terminated":
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/55 font-mono tracking-wider">TERMINATED</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-850 font-mono tracking-wider">{status.toUpperCase()}</span>;
    }
  };

  const getTimelineBadge = (type: string) => {
    const classes = "px-2.5 py-0.5 rounded text-[9px] font-bold font-sans border tracking-wide uppercase ";
    switch (type) {
      case "system_event":
        return (
          <span className={classes + "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-350 dark:border-amber-900/60 font-mono tracking-wider flex items-center gap-1"}>
            ⚡ EVENT
          </span>
        );
      case "classifier_decision":
        return <span className={classes + "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-250 dark:border-purple-900/60"}>Routing Decision</span>;
      case "agent_reasoning":
        return <span className={classes + "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60"}>Agent Thoughts</span>;
      case "tool_execution":
        return <span className={classes + "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60"}>Action Executed</span>;
      case "manual_instruction":
        return <span className={classes + "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/60"}>Human Instruction</span>;
      case "status_change":
        return <span className={classes + "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500 border-zinc-200 dark:border-zinc-850"}>Status Change</span>;
      default:
        return <span className={classes + "bg-transparent text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800"}>{type.replace(/_/g, " ")}</span>;
    }
  };

  const formatText = (text: string) => {
    return text.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const lastSystemEventId = [...timeline].reverse().find(act => act.type === "system_event")?.id;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col text-xs text-zinc-700 dark:text-zinc-300 font-sans transition-colors duration-200">
      <Header activeTab="dashboard" />

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-red-500 dark:text-red-400">
          <AlertOctagon className="h-12 w-12 mb-3 text-red-500" />
          <h2 className="text-sm font-bold uppercase mb-1">Backend Connection Error</h2>
          <p className="max-w-md text-zinc-500 dark:text-zinc-400 mb-4">{error}</p>
          <button 
            onClick={() => fetchRuns(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors rounded cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Retry Connection
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* LEFT SIDEBAR: Runs List */}
          <div className="w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 flex items-center justify-between">
              <span className="font-bold tracking-wide text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <ActivityIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> Supervision Runs
              </span>
              <button 
                onClick={() => {
                  fetchSupervisors();
                  setShowStartModal(true);
                }}
                className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                title="Start Order Supervisor"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-150 dark:divide-zinc-900 bg-white/40 dark:bg-zinc-950/20">
              {loading ? (
                <div className="flex justify-center items-center h-48 text-zinc-400 dark:text-zinc-500">
                  <span className="animate-pulse">Loading Runs Logs...</span>
                </div>
              ) : runs.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 dark:text-zinc-500">
                  No active runs in lifecycle.
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`w-full p-4 text-left hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-all flex flex-col gap-2 ${selectedRunId === run.id ? "bg-zinc-100/80 dark:bg-zinc-900 border-l-2 border-zinc-900 dark:border-white shadow-sm" : ""}`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono tracking-wide">{run.order_id}</span>
                      {getStatusBadge(run.status)}
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 flex justify-between">
                      <span>CREATED: {parseUTCDate(run.created_at).toLocaleTimeString()}</span>
                      <span>{parseUTCDate(run.updated_at).toLocaleDateString()}</span>
                    </div>
                    {run.memory_summary && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 border-t border-zinc-100 dark:border-zinc-800/40 pt-1.5 mt-0.5 font-sans leading-relaxed">
                        {formatCurrencyString(run.memory_summary)}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* RIGHT CONTENT PANEL: Selected Run Details */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
            {selectedRun && selectedRunId ? (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* MIDDLE PANEL: State, Memory, Controls */}
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
                  
                  {/* Row 1: Header and controls */}
                  <div className="bg-white dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                    <div>
                      <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        {selectedRun.order_id}
                        <span className="text-zinc-400 dark:text-zinc-500 text-xs font-normal">({selectedRun.id})</span>
                      </h1>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-550 mt-1 font-mono uppercase">
                        Template: <span className="text-zinc-700 dark:text-zinc-300">
                          {supervisors.find(s => s.id === selectedRun.supervisor_id)?.name || "Premium Express Order Supervisor"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedRun.status)}
                      <span className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1"></span>
                                           {selectedRun.status === "active" && (
                        <button
                          onClick={() => handleControl("pause")}
                          className="px-3 py-1.5 rounded border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                        >
                          <Pause className="h-3.5 w-3.5" /> INTERRUPT
                        </button>
                      )}

                      {selectedRun.status === "paused" && (
                        <button
                          onClick={() => handleControl("resume")}
                          className="px-3 py-1.5 rounded border border-zinc-900 dark:border-zinc-500 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" /> RESUME
                        </button>
                      )}

                      {(selectedRun.status === "active" || selectedRun.status === "paused") && (
                        <button
                          onClick={() => handleControl("terminate")}
                          className="px-3 py-1.5 rounded border border-rose-250 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:border-rose-500 transition-colors flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> TERMINATE
                        </button>
                      )}

                      {/* Visually separated menu dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setShowMoreMenu(!showMoreMenu)}
                          className="p-1.5 rounded border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors flex items-center justify-center cursor-pointer shadow-sm h-7 w-7"
                          title="More Actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {showMoreMenu && (
                          <>
                            {/* Backdrop to close menu */}
                            <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)}></div>
                            
                            {/* Dropdown Menu */}
                            <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1 z-20 overflow-hidden">
                              {(selectedRun.status === "completed" || selectedRun.status === "terminated") ? (
                                <button
                                  onClick={() => {
                                    setShowMoreMenu(false);
                                    handleDeleteRun(selectedRun);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] font-bold text-rose-650 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete Run
                                </button>
                              ) : (
                                <div 
                                  className="w-full text-left px-3 py-2 text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-950/20 flex items-center justify-between cursor-not-allowed select-none"
                                  title="Complete or terminate this run before deleting."
                                >
                                  <span className="flex items-center gap-2 opacity-50">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete Run
                                  </span>
                                  <Lock className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Status & Memory Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Compact Memory Card */}
                    <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-lg flex flex-col shadow-sm">
                      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/30 font-bold text-zinc-850 dark:text-zinc-200 flex justify-between items-center">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-200">Compact Memory Summary</span>
                        <Clipboard className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between min-h-32">
                        <p className="text-zinc-600 dark:text-zinc-300 font-sans leading-relaxed text-[11px]">
                          {formatCurrencyString(selectedRun.memory_summary) || "Memory is currently empty. Waiting for execution..."}
                        </p>
                        <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-3 mt-4 flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500">
                          <span className="font-semibold uppercase tracking-wider text-[9px]">Sleep State:</span>
                          <span className="font-mono text-zinc-600 dark:text-zinc-400 font-bold uppercase">
                            {selectedRun.status === "completed" 
                              ? "Resolved - Asleep Indefinitely"
                              : selectedRun.status === "terminated"
                              ? "Terminated - Workflow Inactive"
                              : selectedRun.status === "paused"
                              ? "Paused - Timer Suspended"
                              : selectedRun.next_wakeup_time 
                              ? `Sleeping until: ${parseUTCDate(selectedRun.next_wakeup_time).toLocaleTimeString()}`
                              : "Sleeping indefinitely"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Custom Instruction Box */}
                    <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-lg flex flex-col shadow-sm">
                      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/30 font-bold text-zinc-850 dark:text-zinc-200 flex justify-between items-center">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-200">Add Run Instruction</span>
                        <MessageSquare className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-3 font-sans leading-relaxed">
                          Add custom guidelines to this specific run. The Main Agent will immediately wake up to integrate them into its reasoning.
                        </p>
                        <form onSubmit={handleSendInstruction} className="flex gap-2">
                          <input
                            type="text"
                            value={newInstruction}
                            onChange={(e) => setNewInstruction(e.target.value)}
                            placeholder="e.g. If delay is logged, escalate to delivery lead."
                            className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 text-zinc-900 dark:text-zinc-100"
                            disabled={selectedRun.status === "completed" || selectedRun.status === "terminated"}
                          />
                          <button
                            type="submit"
                            disabled={sendingInstruction || !newInstruction || selectedRun.status === "completed" || selectedRun.status === "terminated"}
                            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-bold px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {sendingInstruction ? "..." : <Send className="h-3.5 w-3.5" />}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>

                  {/* End-of-Run Output Summary (If completed/terminated) */}
                  {(selectedRun.status === "completed" || selectedRun.status === "terminated") && selectedRun.final_summary && (
                    <div className="bg-white dark:bg-zinc-900/10 border border-zinc-250 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
                      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-900/30 font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-200">End of Run Report Summary</span>
                      </div>
                      <div className="p-5 flex flex-col gap-4 font-sans text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                        <div>
                          <div className="font-mono text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                            Executive Summary:
                          </div>
                          <p className="bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded border border-zinc-150 dark:border-zinc-850">{formatCurrencyString(selectedRun.final_summary.summary)}</p>
                        </div>
                        <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3">
                          <div className="font-mono text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                            Actions Taken:
                          </div>
                          <p className="whitespace-pre-line bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded border border-zinc-150 dark:border-zinc-850">{formatCurrencyString(selectedRun.final_summary.actions_taken)}</p>
                        </div>
                        <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3">
                          <div className="font-mono text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                            Key Learnings:
                          </div>
                          <p className="bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded border border-zinc-150 dark:border-zinc-850">{formatCurrencyString(selectedRun.final_summary.learnings)}</p>
                        </div>
                        <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3">
                          <div className="font-mono text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                            System Recommendations:
                          </div>
                          <p className="bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded border border-zinc-150 dark:border-zinc-850">{formatCurrencyString(selectedRun.final_summary.recommendations)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Interactive Timeline & Log */}
                  <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
                    <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/30 font-bold text-zinc-850 dark:text-zinc-200 flex justify-between items-center">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-200">Supervisor Timeline Logs</span>
                      <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-wider">{timeline.length} History Items</span>
                    </div>

                    <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                      {timeline.length === 0 ? (
                        <div className="text-center text-zinc-400 dark:text-zinc-500 py-12">
                          Timeline initialized. Waiting for events to log...
                        </div>
                      ) : (
                        timeline.map((act) => (
                          <div 
                            key={act.id} 
                            className={`flex gap-4 border-l pl-4 relative ml-2 group transition-all ${
                              act.type === "system_event" 
                                ? "border-l-2 border-amber-500/80 bg-amber-50/5 dark:bg-amber-950/5 rounded-r-lg my-1.5 pr-2 py-2.5" 
                                : "border-zinc-200 dark:border-zinc-800 py-1"
                            }`}
                          >
                            {/* Dot overlay */}
                            {act.type === "system_event" ? (
                              <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-amber-500 bg-white dark:bg-zinc-950 flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                                <span className="relative flex h-1.5 w-1.5">
                                  {act.id === lastSystemEventId && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  )}
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                </span>
                              </div>
                            ) : (
                              <div className="absolute -left-1.5 top-2.5 h-3 w-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 transition-colors"></div>
                            )}

                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getTimelineBadge(act.type)}
                                  <span className={`font-bold tracking-wide ${act.type === "system_event" ? "text-zinc-900 dark:text-white text-[11px]" : "text-zinc-850 dark:text-zinc-200 text-[10px]"}`}>
                                    {formatText(act.name)}
                                  </span>
                                </div>
                                <span className="text-zinc-400 dark:text-zinc-550 text-[9px] font-mono">
                                  {parseUTCDate(act.timestamp).toLocaleTimeString()}
                                </span>
                              </div>

                              {/* Details render depending on activity type */}
                              {act.type === "system_event" && (
                                <div className="border border-zinc-200 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-950/40 p-2.5 rounded shadow-sm">
                                  <pre className="text-[10px] overflow-x-auto text-zinc-600 dark:text-zinc-400 font-mono leading-normal">
                                    {JSON.stringify(act.payload, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {act.type === "classifier_decision" && (
                                <div className={`p-2.5 rounded border flex flex-col gap-1 shadow-inner ${
                                  act.payload.should_wake 
                                    ? "bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-900/40 text-violet-750 dark:text-violet-300"
                                    : "bg-zinc-50/40 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400"
                                }`}>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] uppercase font-bold font-mono tracking-wider ${
                                      act.payload.should_wake ? "text-violet-600 dark:text-violet-400" : "text-zinc-400 dark:text-zinc-550"
                                    }`}>Trigger Agent Wakeup?</span>
                                    <span className={`font-bold font-mono text-[10px] ${
                                      act.payload.should_wake ? "text-violet-900 dark:text-white" : "text-zinc-450 dark:text-zinc-600"
                                    }`}>
                                      {act.payload.should_wake ? "YES (WAKE)" : "NO (SLEEP)"}
                                    </span>
                                  </div>
                                  <p className={`text-[10px] italic font-sans leading-relaxed ${
                                    act.payload.should_wake ? "text-violet-650 dark:text-violet-400/90" : "text-zinc-500 dark:text-zinc-500"
                                  }`}>
                                    Reasoning: {formatCurrencyString(act.payload.reasoning)}
                                  </p>
                                </div>
                              )}

                              {act.type === "agent_reasoning" && (
                                <div className="bg-zinc-50/40 dark:bg-zinc-900/80 p-3 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-sans leading-relaxed text-[11px] shadow-sm">
                                  <div className="font-mono text-zinc-400 dark:text-zinc-550 text-[9px] uppercase font-bold mb-1 tracking-wider">
                                    Agent Thought reasoning:
                                  </div>
                                  {formatCurrencyString(act.payload.reasoning)}
                                </div>
                              )}

                              {act.type === "tool_execution" && (
                                <div className="p-3 border border-emerald-250 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-md flex flex-col gap-1 shadow-sm">
                                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider font-sans">
                                    Action Dispatched: {formatText(act.name)}
                                  </div>
                                  <p className="text-zinc-700 dark:text-zinc-300 font-sans mt-1 text-[11px]">
                                    {formatCurrencyString(act.payload.message || JSON.stringify(act.payload))}
                                  </p>
                                </div>
                              )}

                              {act.type === "manual_instruction" && (
                                <div className="p-2 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/20 text-zinc-600 dark:text-zinc-300 rounded border-dashed text-[11px] font-sans">
                                  {formatCurrencyString(act.payload.text)}
                                </div>
                              )}

                              {act.type === "status_change" && (
                                <div className="text-zinc-400 dark:text-zinc-500 text-[10px] font-sans italic flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                                  {act.payload.message || act.payload.reason || "Status changed."}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT PANEL: Event Generator */}
                <div className="w-full md:w-80 p-6 flex flex-col gap-4 bg-zinc-100/30 dark:bg-zinc-900/10 overflow-y-auto">
                  <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center gap-1.5">
                    <ActivityIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">Event Injection Simulator</h2>
                  </div>

                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed font-sans">
                    Select an order lifecycle event to inject as a signal to the active Temporal workflow.
                  </p>

                  <form onSubmit={handleInjectEvent} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Event Type</label>
                      <select
                        value={selectedEvent}
                        onChange={(e) => setSelectedEvent(e.target.value)}
                        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-md px-2.5 py-2 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 w-full shadow-sm text-xs"
                        disabled={selectedRun.status === "completed" || selectedRun.status === "terminated"}
                      >
                        {simulatorEvents.map((evt) => (
                          <option key={evt.name} value={evt.name}>{evt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Event Payload (JSON)</label>
                      <textarea
                        value={eventPayload}
                        onChange={(e) => setEventPayload(e.target.value)}
                        rows={6}
                        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-md px-3 py-2 font-mono focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 w-full resize-none text-[10px] shadow-sm leading-normal"
                        disabled={selectedRun.status === "completed" || selectedRun.status === "terminated"}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={injecting || selectedRun.status === "completed" || selectedRun.status === "terminated"}
                      className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-bold py-2.5 rounded-md flex items-center justify-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-sm text-xs"
                    >
                      {injecting ? "Injecting..." : <>Inject Event <Play className="h-3 w-3 fill-current" /></>}
                    </button>
                  </form>

                  <div className="border-t border-zinc-200 dark:border-zinc-800 my-2"></div>
                  
                  <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/60 rounded-md p-3 text-[10px] leading-relaxed text-zinc-450 dark:text-zinc-550 shadow-sm">
                    <div className="font-bold text-zinc-600 dark:text-zinc-450 flex items-center gap-1 mb-1 font-mono uppercase tracking-wider text-[9px]">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-400" /> Quick Tips
                    </div>
                    <ul className="list-disc list-inside space-y-1 font-sans">
                      <li>Routine events (e.g. <b>payment_confirmed</b>) should keep the workflow asleep.</li>
                      <li>Critical updates (e.g. <b>shipment_delayed</b>) should trigger immediate wake up.</li>
                      <li>Custom instructions wake the main agent immediately.</li>
                    </ul>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-zinc-400 dark:text-zinc-500">
                <Clipboard className="h-16 w-16 mb-4 text-zinc-350 dark:text-zinc-800 stroke-[1]" />
                <h3 className="text-zinc-600 dark:text-zinc-400 font-bold tracking-wider mb-1 uppercase font-mono text-xs">No Run Selected</h3>
                <p className="max-w-xs font-sans text-zinc-450 dark:text-zinc-550 text-[11px] leading-relaxed">Select an order run from the sidebar or start a new supervisor to begin real-time monitoring.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* START RUN MODAL */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg w-full max-w-md overflow-hidden flex flex-col shadow-xl">
            <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 px-4 py-3.5 flex items-center justify-between">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 tracking-wide text-xs">Start Order Supervisor</span>
              <button 
                onClick={() => setShowStartModal(false)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white font-sans text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleStartRun} className="p-5 flex flex-col gap-4">
              {startError && (
                <div className="p-3 border border-red-200 dark:border-red-500/50 bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 rounded-md">
                  {startError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-600 dark:text-zinc-450 font-semibold uppercase tracking-wider text-[9px]">Order ID *</label>
                <input
                  type="text"
                  value={newOrderId}
                  onChange={(e) => setNewOrderId(e.target.value)}
                  placeholder="e.g. ORD-9874"
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 w-full text-xs shadow-sm"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-600 dark:text-zinc-450 font-semibold uppercase tracking-wider text-[9px]">Supervisor Template *</label>
                {supervisors.length === 0 ? (
                  <div className="text-red-500 dark:text-red-400 p-2 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded text-center">
                    No supervisor template configured. Please create one first on the templates tab.
                  </div>
                ) : (
                  <select
                    value={selectedSupervisorId}
                    onChange={(e) => setSelectedSupervisorId(e.target.value)}
                    className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-2.5 py-2 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 w-full text-xs shadow-sm"
                    required
                  >
                    {supervisors.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-600 dark:text-zinc-450 font-semibold uppercase tracking-wider text-[9px]">Initial Custom Instruction</label>
                <textarea
                  value={initialInstruction}
                  onChange={(e) => setInitialInstruction(e.target.value)}
                  placeholder="e.g. Prioritize speed over cost. If delayed, message logistics lead."
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 w-full resize-none h-20 text-xs shadow-sm"
                />
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>

              <div className="flex justify-end gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-650 dark:text-zinc-350 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-md font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={starting || supervisors.length === 0}
                  className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all font-bold px-4 py-2 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  {starting ? "Starting..." : <>Launch Run <Play className="h-3 w-3 fill-current" /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 px-4 py-3 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-850 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 min-w-[320px]">
          {toast.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {toast.type === "error" && <AlertOctagon className="h-4 w-4 text-rose-550" />}
          {toast.type === "info" && <ActivityIcon className="h-4 w-4 text-blue-500" />}
          <div className="flex-1 font-semibold text-[11px] leading-snug">
            {toast.message}
          </div>
          <button 
            onClick={() => setToast(null)} 
            className="text-zinc-450 dark:text-zinc-500 hover:text-zinc-750 dark:hover:text-zinc-300 transition-colors font-bold text-[10px] cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
