import { useState } from "react";
import { Timeline } from "../components/Timeline";

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">Patient Timeline</h1>
      <Timeline />
    </div>
  );
}

export default App;
