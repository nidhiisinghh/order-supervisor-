"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { Settings, Plus, Play, ShieldAlert, Cpu } from "lucide-react";

interface Supervisor {
  id: string;
  name: string;
  base_instruction: string;
  default_wakeup_behavior: string;
  model_choice: string;
  aggressiveness: string;
  created_at: string;
}

export default function TemplatesPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [baseInstruction, setBaseInstruction] = useState("");
  const [defaultWakeup, setDefaultWakeup] = useState("Sleep 2 hours, wake on any critical event.");
  const [modelChoice, setModelChoice] = useState("llama-3.3-70b-versatile");
  const [aggressiveness, setAggressiveness] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const backendUrl = "http://localhost:8000";

  const fetchSupervisors = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/supervisors`);
      if (!res.ok) throw new Error("Failed to load supervisors list");
      const data = await res.json();
      setSupervisors(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "An error occurred fetching supervisor templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !baseInstruction) {
      setFormError("Name and Base Instructions are required.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${backendUrl}/api/supervisors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          base_instruction: baseInstruction,
          default_wakeup_behavior: defaultWakeup,
          model_choice: modelChoice,
          aggressiveness,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create supervisor template");
      }

      setSuccessMsg("Template created successfully!");
      setName("");
      setBaseInstruction("");
      setDefaultWakeup("Sleep 2 hours, wake on any critical event.");
      fetchSupervisors();
    } catch (err: any) {
      setFormError(err.message || "An error occurred during submission");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col text-xs text-zinc-700 dark:text-zinc-300 font-sans transition-colors duration-200">
      <Header activeTab="templates" />

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Templates List */}
        <div className="lg:col-span-2 flex flex-col bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
          <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-55 dark:bg-zinc-900/20 px-4 py-3 flex items-center justify-between">
            <h2 className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide flex items-center gap-2">
              <Settings className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              Configured Supervisor Templates
            </h2>
            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px] uppercase font-bold tracking-wider">{supervisors.length} Templates Found</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center items-center h-48 text-zinc-400 dark:text-zinc-500">
                <span className="animate-pulse">Loading Templates...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-48 text-red-500 dark:text-red-400 p-4">
                <ShieldAlert className="h-8 w-8 mb-2" />
                <span>{error}</span>
                <button 
                  onClick={fetchSupervisors} 
                  className="mt-4 px-3 py-1.5 border border-red-200 dark:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 rounded-md transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            ) : supervisors.length === 0 ? (
              <div className="flex justify-center items-center h-48 text-zinc-400 dark:text-zinc-500">
                <span>No templates declared. Create one to start.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-850 bg-zinc-50/40 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-450 font-bold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Wakefulness</th>
                    <th className="p-3">Agility</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150 dark:divide-zinc-900">
                  {supervisors.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-100/30 dark:hover:bg-zinc-900/15 transition-colors">
                      <td className="p-3 font-semibold text-zinc-900 dark:text-zinc-200">
                        <div className="text-sm">{item.name}</div>
                        <div className="text-zinc-500 dark:text-zinc-400 font-normal text-[10px] max-w-md line-clamp-2 mt-1 leading-relaxed">
                          {item.base_instruction}
                        </div>
                      </td>
                      <td className="p-3 text-zinc-650 dark:text-zinc-300 font-mono text-[10px]">
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Cpu className="h-3.5 w-3.5 text-zinc-400" />
                          {item.model_choice}
                        </div>
                      </td>
                      <td className="p-3 text-zinc-500 dark:text-zinc-450">{item.default_wakeup_behavior || "None"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          item.aggressiveness === "high" 
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-sm" 
                            : item.aggressiveness === "medium"
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-250 dark:border-zinc-700"
                            : "bg-transparent text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-850"
                        }`}>
                          {item.aggressiveness.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400 dark:text-zinc-500 font-mono">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right 1 Column: Create Template Form */}
        <div className="bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-lg flex flex-col overflow-hidden shadow-sm">
          <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-55 dark:bg-zinc-900/20 px-4 py-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h2 className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide">New Supervisor Template</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto bg-white/40 dark:bg-zinc-950/20">
            {formError && (
              <div className="p-3 border border-red-200 dark:border-red-500/50 bg-red-50 dark:bg-red-950/20 text-red-550 dark:text-red-400 rounded-md">
                {formError}
              </div>
            )}
            {successMsg && (
              <div className="p-3 border border-emerald-250 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-md">
                {successMsg}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-550 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Template Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VIP D2C Order Supervisor"
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:border-zinc-455 dark:focus:border-zinc-500 shadow-sm"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-550 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Base Instructions (System Prompt) *</label>
              <textarea
                value={baseInstruction}
                onChange={(e) => setBaseInstruction(e.target.value)}
                placeholder="Instruct the agent on how to manage orders, customer queries, and logistics events..."
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-255 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 h-36 resize-none focus:outline-none focus:border-zinc-450 dark:focus:border-zinc-500 shadow-sm leading-relaxed"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-555 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Default Wakeup Behavior</label>
              <input
                type="text"
                value={defaultWakeup}
                onChange={(e) => setDefaultWakeup(e.target.value)}
                placeholder="e.g. Sleep 2 hours, wake on any critical event."
                className="bg-zinc-50 dark:bg-zinc-955 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:border-zinc-450 dark:focus:border-zinc-500 shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-555 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Routing Model</label>
                <select
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-md px-2 py-2 focus:outline-none focus:border-zinc-450 dark:focus:border-zinc-500 shadow-sm"
                >
                  <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                  <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-555 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">Agile Wakefulness</label>
                <select
                  value={aggressiveness}
                  onChange={(e) => setAggressiveness(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-255 dark:border-zinc-800 text-zinc-850 dark:text-zinc-100 rounded-md px-2 py-2 focus:outline-none focus:border-zinc-450 dark:focus:border-zinc-500 shadow-sm"
                >
                  <option value="low">Low (Rarely Wake)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Wake often)</option>
                </select>
              </div>
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 my-2"></div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all font-bold py-2.5 rounded-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {submitting ? "Creating..." : <>Create Template <Play className="h-3 w-3 fill-current" /></>}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
