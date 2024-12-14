require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 8001;

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Appointment schema definition (for reference)
const appointmentSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: { type: String, required: true },
  service: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
});
const Appointment = mongoose.model('Appointment', appointmentSchema);

// Define the Reminder schema and model
const reminderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  alertTime: { type: Date, required: true },
  status: { type: String, default: 'pending' }
});
const Reminder = mongoose.model('Reminder', reminderSchema);

// Endpoint to check the status of reminders
app.get("/reminders", async (req, res) => {
  try {
    const reminders = await Reminder.find().populate('appointmentId');
    res.json(reminders);
  } catch (error) {
    res.status(500).send("Error fetching reminders");
  }
});

function formatTimeTo12Hour(time24) {
  const [hours, minutes] = time24.split(":");
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12; // Convert 0 to 12 for 12-hour format
  return `${hour12}:${minutes} ${period}`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toDateString(); // Returns date in "Thu Dec 12 2024" format
}

async function sendToWhatsApp(messageData) {
  try {
      await axios.post(process.env.WHATSAPP_API_URL, messageData, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
      });
  } catch (error) {
      console.error("Error sending message:", error.response?.data || error.message);
  }
}

async function sendLocation(phone) {
  const locationMessage = {
      messaging_product: 'whatsapp',
      to: `whatsapp:${phone}`,
      type: 'location',
      location: {
          latitude: process.env.SPA_LATITUDE, // Example latitude
          longitude: process.env.SPA_LONGITUDE, // Example longitude
          name: process.env.SPA_NAME,
          address: process.env.SPA_ADDRESS
      }
  };

  await sendToWhatsApp(locationMessage);
}

// Schedule reminders every minutes using cron
cron.schedule('* * * * *', async () => {
  const now = new Date();
  now.setHours(now.getHours() + 5);   // Add 5 hours
  now.setMinutes(now.getMinutes() + 30); // Add 30 minutes  
  console.log(now)
  console.log(now)
  console.log(`${now} Running reminder job every minutes`);
  
  
  try {
    const reminders = await Reminder.find({ alertTime: { $lte: now }, status: 'pending' }).populate('appointmentId');
    console.log(`${now} Found ${reminders.length} reminders to process`);

    for (let reminder of reminders) {
      const { appointmentId } = reminder;
      const { phone, name, service, date, time } = appointmentId;

      const message = `
        Hi ${name}, this is a reminder for your appointment at Oasis Spa:\nService: ${service}\nDate: ${formatDate(date)}\nTime: ${formatTimeTo12Hour(time)}\n📍Location: 123 Main Street, New York
      `;


      try {
        console.log(`${now} Sending reminder to ${phone}`);
        await sendWhatsAppMessage(phone, message);
        sendLocation(phone)   
        reminder.status = 'sent';
        await reminder.save();
        console.log(`${now} Reminder sent and status updated for ${phone}`);
      } catch (error) {
        console.error(`${now} Error sending reminder for ${phone}:`, error);
      }
    }
  } catch (error) {
    console.error(`[${now}] Error processing reminders:`, error);
  }
});

// Function to send message via WhatsApp API
async function sendWhatsAppMessage(phone, message) {
  try {
    const messageData = {
      messaging_product: 'whatsapp',
      to: `whatsapp:${phone}`,
      type: 'text',
      text: { body: message },
    };

    await axios.post(process.env.WHATSAPP_API_URL, messageData, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });
  } catch (error) {
    throw error;
  }
}

app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Reminder Server running on port ${port}`);
});
