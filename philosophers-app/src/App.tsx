import { useState, useEffect } from 'react';
import './App.css'; // Assuming you still have this file!

// 1. Define the "Shape" of our data (copied from your models.py)
interface PhilosopherInfo {
  name: string;        //  Use 'string' in React/TypeScript
  description: string; // 
  has_voice: boolean;  //
}

function App() {
  // 2. Create the State to hold our data
  // It starts as an empty array []
  const [philosophers, setPhilosophers] = useState<PhilosopherInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 3. The useEffect hook: This runs automatically when the page loads
  useEffect(() => {
    // Send the waiter to the backend URL
    fetch('http://localhost:8000/api/philosophers')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json(); // Convert the response to JSON
      })
      .then((data) => {
        // Save the data into our React State
        setPhilosophers(data);
      })
      .catch((error) => {
        console.error("Failed to fetch philosophers:", error);
        setError("Could not connect to the backend. Is it running?");
      });
  }, []); // The empty array means "only run this once"

  // 4. Draw the UI
  return (
    <div className="app-container">
      <h1>The Philosophers Panel</h1>
      
      {/* Show an error message if the backend isn't running */}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Loop through the philosophers and display them */}
      <div className="philosopher-list">
        {philosophers.map((philosopher) => (
          <div key={philosopher.name} className="philosopher-card">
            <h2>{philosopher.name}</h2>
            <p>{philosopher.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;