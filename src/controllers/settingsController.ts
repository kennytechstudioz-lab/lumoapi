import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import SystemSettings from '../models/SystemSettings';
import EmailTemplate from '../models/EmailTemplate';
import User from '../models/User';
import { sendEmail, wrapInMasterEmailTemplate } from '../utils/mailer';

// Get Settings
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await SystemSettings.findOne({});
    if (!settings) {
      settings = new SystemSettings({
        companyName: 'Lumo Group Ltd',
        companyBankName: 'Lumo Group',
        companyAccountNumber: '0034588686',
        systemEmail: 'support@lumogroupintl.com',
        companyBank: 'Lumo Group Bank',
        routineNumber: 'DE42',
        companyAddress: '6060 ROCKSIDE WOODS BLVD, OH United States',
        companyPhoneNumber: '+1 (555) 123-4567',
        companyDomain: 'lumogroupintl.com',
        swiftCode: 'DETBDE21XXX',
        sortCode: '66215307',
        btcAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        usdtAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });
      await settings.save();
    }
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

// Update Settings
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      companyName,
      companyBankName,
      companyAccountNumber,
      systemEmail,
      companyBank,
      routineNumber,
      companyAddress,
      companyPhoneNumber,
      companyDomain,
      swiftCode,
      sortCode,
      btcAddress,
      usdtAddress
    } = req.body;

    let settings = await SystemSettings.findOne({});
    if (!settings) {
      settings = new SystemSettings({
        companyName,
        companyBankName,
        companyAccountNumber,
        systemEmail,
        companyBank,
        routineNumber,
        companyAddress,
        companyPhoneNumber,
        companyDomain,
        swiftCode,
        sortCode,
        btcAddress,
        usdtAddress
      });
    } else {
      if (companyName !== undefined) settings.companyName = companyName;
      if (companyBankName !== undefined) settings.companyBankName = companyBankName;
      if (companyAccountNumber !== undefined) settings.companyAccountNumber = companyAccountNumber;
      if (systemEmail !== undefined) settings.systemEmail = systemEmail;
      if (companyBank !== undefined) settings.companyBank = companyBank;
      if (routineNumber !== undefined) settings.routineNumber = routineNumber;
      if (companyAddress !== undefined) settings.companyAddress = companyAddress;
      if (companyPhoneNumber !== undefined) settings.companyPhoneNumber = companyPhoneNumber;
      if (companyDomain !== undefined) settings.companyDomain = companyDomain;
      if (swiftCode !== undefined) settings.swiftCode = swiftCode;
      if (sortCode !== undefined) settings.sortCode = sortCode;
      if (btcAddress !== undefined) settings.btcAddress = btcAddress;
      if (usdtAddress !== undefined) settings.usdtAddress = usdtAddress;
    }

    await settings.save();
    res.json({ message: 'System settings updated successfully', settings });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating system settings', error: error.message });
  }
};

// List Email Templates (Paginated)
export const listEmailTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const totalCount = await EmailTemplate.countDocuments({});
    const templates = await EmailTemplate.find({})
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    res.json({
      templates,
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching email templates', error: error.message });
  }
};

// Create Email Template
export const createEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, title, content } = req.body;
    if (!name || !title || !content) {
       res.status(400).json({ message: 'Missing required template fields' });
       return;
    }

    const existing = await EmailTemplate.findOne({ name });
    if (existing) {
       res.status(400).json({ message: 'A template with this trigger key already exists' });
       return;
    }

    const template = new EmailTemplate({ name, title, content });
    await template.save();
    res.status(201).json({ message: 'Email template created successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating template', error: error.message });
  }
};

// Update Email Template
export const updateEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, title, content } = req.body;
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
       res.status(404).json({ message: 'Template not found' });
       return;
    }

    if (name !== undefined) template.name = name;
    if (title !== undefined) template.title = title;
    if (content !== undefined) template.content = content;

    await template.save();
    res.json({ message: 'Email template updated successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

// Send Bulk/Single Email to Users
export const sendBulkEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userIds, subject, content } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ message: 'No recipients selected' });
      return;
    }
    if (!subject || !content) {
      res.status(400).json({ message: 'Subject and content are required' });
      return;
    }

    const users = await User.find({ _id: { $in: userIds } });
    if (users.length === 0) {
      res.status(404).json({ message: 'Selected users not found' });
      return;
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const u of users) {
      if (!u.email) continue;

      let userSubject = subject;
      let userContent = content;
      const vars: Record<string, string> = {
        fullName: u.fullName || u.username,
        name: u.fullName || u.username,
        username: u.username,
        email: u.email,
        accountNumber: u.accountNumber || '',
      };

      Object.keys(vars).forEach((k) => {
        const reg = new RegExp(`{{\\s*${k}\\s*}}`, 'gi');
        userSubject = userSubject.replace(reg, vars[k]);
        userContent = userContent.replace(reg, vars[k]);
      });

      const bodyHtml = `
        <div style="margin-top: 10px; color: #334155;">
          ${userContent.replace(/\n/g, '<br/>')}
        </div>
      `;

      const formattedHtml = wrapInMasterEmailTemplate(userSubject, bodyHtml);
      const sent = await sendEmail(u.email, userSubject, formattedHtml);
      if (sent) {
        sentCount++;
      } else {
        errors.push(`Failed sending to ${u.email}`);
      }
    }

    res.json({
      message: `Successfully dispatched email to ${sentCount} user(s).`,
      sentCount,
      totalSelected: users.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error dispatching bulk emails:', error);
    res.status(500).json({ message: 'Error dispatching bulk emails', error: error.message });
  }
};
