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
  console.log(`[${new Date().toISOString()}] GET /reminders - Fetching reminders`);
  try {
    const reminders = await Reminder.find().populate('appointmentId');
    console.log(`[${new Date().toISOString()}] Reminders fetched successfully`);
    res.json(reminders);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching reminders:`, error);
    res.status(500).send("Error fetching reminders");
  }
});

// Schedule reminders every minutes using cron
cron.schedule('* * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running reminder job every minutes`);
  
  const now = new Date();
  try {
    const reminders = await Reminder.find({ alertTime: { $gte: now }, status: 'pending' }).populate('appointmentId');
    console.log(`[${new Date().toISOString()}] Found ${reminders.length} reminders to process`);

    for (let reminder of reminders) {
      const { appointmentId } = reminder;
      const { phone, name, service, date, time } = appointmentId;

      const message = `
        Hi ${name}, this is a reminder for your appointment at Oasis Spa:
        - Service: ${service}
        - Date: ${date}
        - Time: ${time}
        📍 Location: 123 Main Street, New York
      `;

      try {
        console.log(`[${new Date().toISOString()}] Sending reminder to ${phone}`);
        await sendWhatsAppMessage(phone, message);
        reminder.status = 'sent';
        await reminder.save();
        console.log(`[${new Date().toISOString()}] Reminder sent and status updated for ${phone}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending reminder for ${phone}:`, error);
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing reminders:`, error);
  }
});

// Function to send message via WhatsApp API
async function sendWhatsAppMessage(phone, message) {
  console.log(`[${new Date().toISOString()}] Preparing to send WhatsApp message to ${phone}`);
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
    console.log(`[${new Date().toISOString()}] WhatsApp message sent to ${phone}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending message to WhatsApp for ${phone}:`, error.response?.data || error.message);
    throw error;
  }
}

app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Reminder Server running on port ${port}`);
});