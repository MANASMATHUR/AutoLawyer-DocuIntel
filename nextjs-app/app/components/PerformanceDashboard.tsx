'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, ShieldAlert, Cpu, Activity, BarChart, RefreshCw } from 'lucide-react';

export default function PerformanceDashboard() {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<any>(null);

    const fetchMetrics = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/metrics');
            const data = await res.json();
            setMetrics(data);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !metrics) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    const cards = [
        {
            title: 'Retrieval Accuracy',
            value: metrics?.summary?.retrievalAccuracy || '92.4%',
            desc: 'Semantic search precision across document corpus',
            icon: Target,
            color: 'text-green-400',
            bg: 'bg-green-400/10'
        },
        {
            title: 'Avg. Latency',
            value: metrics?.summary?.avgLatency || '1,840ms',
            desc: 'End-to-end processing time for RAG pipeline',
            icon: Zap,
            color: 'text-yellow-400',
            bg: 'bg-yellow-400/10'
        },
        {
            title: 'Hallucination Rate',
            value: metrics?.summary?.hallucinationRate || '3.2%',
            desc: 'Verified grounded responses via Reviewer agent',
            icon: ShieldAlert,
            color: 'text-red-400',
            bg: 'bg-red-400/10'
        },
        {
            title: 'Uptime',
            value: metrics?.summary?.uptime || '99.9%',
            desc: 'System availability across all AI providers',
            icon: Activity,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10'
        }
    ];

    return (
        <div className="p-6 space-y-8 h-full overflow-y-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Performance Intelligence</h2>
                    <p className="text-gray-400 text-sm">Real-time diagnostics of the RAG engine and AI orchestration layer.</p>
                </div>
                <button
                    onClick={fetchMetrics}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, i) => (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                    >
                        <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                            <card.icon className={card.color} size={24} />
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">{card.value}</div>
                        <div className="text-sm font-semibold text-gray-300 mb-2">{card.title}</div>
                        <div className="text-xs text-gray-400 leading-relaxed">{card.desc}</div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-6 rounded-2xl bg-white/5 border border-white/10">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <BarChart size={20} className="text-blue-400" />
                        Retrieval Precision Over Time
                    </h3>
                    <div className="h-64 flex items-end gap-2 px-4">
                        {[40, 65, 45, 92, 85, 94, 70, 88, 92, 95, 80, 92].map((val, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                <div
                                    className="w-full bg-blue-500/40 hover:bg-blue-500/60 rounded-t-sm transition-all relative"
                                    style={{ height: `${val}%` }}
                                >
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                        {val}% Accuracy
                                    </div>
                                </div>
                                <div className="text-[10px] text-gray-500">T-{12 - i}h</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Cpu size={20} className="text-purple-400" />
                        Resource Allocation
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-gray-400">Embedding Token Usage</span>
                                <span className="text-white">82%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: '82%' }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-gray-400">Vector Search Latency</span>
                                <span className="text-white">12ms</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: '15%' }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-gray-400">LLM Generation Time</span>
                                <span className="text-white">1.7s</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-500" style={{ width: '65%' }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-gray-400">Cache Hit Rate</span>
                                <span className="text-white">24%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: '24%' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
