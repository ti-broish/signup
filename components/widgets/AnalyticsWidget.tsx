
import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';

const data = [
  { name: 'Mon', value: 400, uv: 2400 },
  { name: 'Tue', value: 300, uv: 1398 },
  { name: 'Wed', value: 600, uv: 9800 },
  { name: 'Thu', value: 800, uv: 3908 },
  { name: 'Fri', value: 500, uv: 4800 },
  { name: 'Sat', value: 900, uv: 3800 },
  { name: 'Sun', value: 1100, uv: 4300 },
];

const AnalyticsWidget: React.FC = () => {
  return (
    <div className="h-full bg-white p-4 border rounded-lg shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">User Activity Pulse</h3>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#6366f1" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center border-t pt-4">
        <div>
          <div className="text-lg font-bold text-indigo-600">12.5k</div>
          <div className="text-xs text-gray-400">Total Visits</div>
        </div>
        <div>
          <div className="text-lg font-bold text-green-600">+14%</div>
          <div className="text-xs text-gray-400">Growth</div>
        </div>
        <div>
          <div className="text-lg font-bold text-orange-600">2.4m</div>
          <div className="text-xs text-gray-400">Avg Session</div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsWidget;
