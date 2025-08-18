import React from "react";
import { mockPatientEvents, TimelineEvent } from "../data/mockPatientData";

const typeColors: Record<string, string> = {
  diagnosis: "bg-red-500",
  medication: "bg-blue-500",
  lab: "bg-green-500",
  procedure: "bg-yellow-500",
  complaint: "bg-pink-500",
  imaging: "bg-purple-500",
  vital: "bg-teal-500",
};

export const Timeline: React.FC = () => {
  return (
    <div className="p-4 overflow-x-auto border border-gray-200 rounded-md bg-white shadow-md">
      <div className="min-w-[1500px] flex items-center space-x-8 px-4 py-6 relative">
        {mockPatientEvents.map((event: TimelineEvent) => (
          <div key={event.id} className="flex flex-col items-center">
            <div
              className={`w-4 h-4 rounded-full ${
                typeColors[event.type] || "bg-gray-400"
              }`}
              title={event.label}
            />
            <div className="mt-2 text-xs text-center max-w-[100px]">
              {new Date(event.timestamp).toLocaleDateString()}
              <br />
              <span className="font-semibold">{event.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
