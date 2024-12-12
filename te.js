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

// Define the Reminder schema and model on the reminder server
const reminderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  alertTime: { type: Date, required: true },
  status: { type: String, default: 'pending' }
});
const Reminder = mongoose.model('Reminder', reminderSchema);

// Endpoint to check the status of reminders
app.get("/reminders", async (req, res) => {
  const reminders = await Reminder.find().populate('appointmentId');
  res.json(reminders);
});

// Schedule reminders every 15 minutes using cron
cron.schedule('*/15 * * * *', async () => {
  console.log('Running reminder job every 15 minutes');
  
  const now = new Date();
  const reminders = await Reminder.find({ alertTime: { $lte: now }, status: 'pending' }).populate('appointmentId');
  
  // Loop through all the reminders and send them
  for (let reminder of reminders) {
    const { appointmentId } = reminder;
    const { phone, name, service, date, time } = appointmentId;

    // Send reminder message via WhatsApp API
    const message = `
      Hi ${name}, this is a reminder for your appointment at Oasis Spa:
      - Service: ${service}
      - Date: ${date}
      - Time: ${time}
      📍 Location: 123 Main Street, New York
    `;

    try {
      await sendWhatsAppMessage(phone, message);
      reminder.status = 'sent'; // Mark reminder as sent
      await reminder.save(); // Save updated reminder status
    } catch (error) {
      console.error(`Error sending reminder for ${phone}:`, error);
    }
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
    console.error("Error sending message to WhatsApp:", error.response?.data || error.message);
  }
}

app.listen(port, () => {
  console.log(`Reminder Server running on port ${port}`);
});
