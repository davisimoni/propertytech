-- CreateIndex
CREATE INDEX "WhatsAppConfig_webhookVerifyToken_idx" ON "WhatsAppConfig"("webhookVerifyToken");

-- CreateIndex
CREATE INDEX "WhatsAppConfig_provider_twilioWhatsAppNumber_idx" ON "WhatsAppConfig"("provider", "twilioWhatsAppNumber");

