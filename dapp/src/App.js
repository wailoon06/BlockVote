import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Register from "./pages/Register";
import GetUser from "./pages/GetUser";
import AllUsers from "./pages/AllUsers";
import "./App.css";

function App() {
  return (
    <Router>
      <div className="App">
        <header style={headerStyle}>
          <h2>User Registration DApp</h2>
          <nav style={navStyle}>
            <Link to="/" style={linkStyle}>Home</Link>
            <Link to="/register" style={linkStyle}>Register</Link>
            <Link to="/get-user" style={linkStyle}>Get User</Link>
            <Link to="/all-users" style={linkStyle}>All Users</Link>
          </nav>
        </header>

        <main style={mainStyle}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/get-user" element={<GetUser />} />
            <Route path="/all-users" element={<AllUsers />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function Home() {
  return (
    <div style={homeStyle}>
      <h1>Welcome to User Registration DApp</h1>
      <p>A decentralized application for registering and managing user information on the blockchain.</p>
      
      <div style={featuresStyle}>
        <div style={featureCard}>
          <h3>📝 Register</h3>
          <p>Register new users with their name and IC number</p>
        </div>
        <div style={featureCard}>
          <h3>🔍 Get User</h3>
          <p>Look up individual user details by ID</p>
        </div>
        <div style={featureCard}>
          <h3>👥 All Users</h3>
          <p>View all registered users in the system</p>
        </div>
      </div>
    </div>
  );
}

// Styles
const headerStyle = {
  padding: "20px 40px",
  backgroundColor: "#282c34",
  color: "white",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
};

const navStyle = {
  marginTop: "15px",
  display: "flex",
  gap: "25px"
};

const linkStyle = {
  color: "#61dafb",
  textDecoration: "none",
  fontSize: "16px",
  fontWeight: "500",
  transition: "color 0.2s"
};

const mainStyle = {
  minHeight: "calc(100vh - 140px)"
};

const homeStyle = {
  padding: "60px 40px",
  maxWidth: "1200px",
  margin: "0 auto",
  textAlign: "center"
};

const featuresStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "30px",
  marginTop: "40px"
};

const featureCard = {
  padding: "30px",
  backgroundColor: "#f5f5f5",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
};

export default App;
