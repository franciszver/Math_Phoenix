# Math Phoenix - Deployment Guide

This guide covers multiple deployment options for hosting Math Phoenix so others can use it.

## 🏗️ Architecture Overview

Math Phoenix consists of:
- **Frontend**: React + Vite static site
- **Backend**: Express.js API server
- **Database**: AWS DynamoDB
- **Storage**: AWS S3 (for images)
- **External APIs**: OpenAI API, AWS Textract

## 📋 Deployment Options

### Option 1: AWS (Recommended for Production)
- **Frontend**: S3 + CloudFront
- **Backend**: Elastic Beanstalk or ECS
- **Best for**: Full control, scalability, existing AWS infrastructure

### Option 2: Vercel + Railway (Easiest)
- **Frontend**: Vercel
- **Backend**: Railway
- **Best for**: Quick deployment, minimal configuration

### Option 3: Render (All-in-One)
- **Frontend**: Render Static Site
- **Backend**: Render Web Service
- **Best for**: Simple setup, single platform

---

## 🚀 Option 1: AWS Deployment (Recommended)

### Prerequisites
- AWS Account with appropriate permissions
- AWS CLI configured
- Domain name (optional but recommended)

### Step 1: Deploy Backend to AWS Elastic Beanstalk

#### 1.1 Install EB CLI
```bash
pip install awsebcli
```

#### 1.2 Initialize Elastic Beanstalk
```bash
cd backend
eb init -p node.js-18 math-phoenix-backend --region us-east-1
```

#### 1.3 Create Environment
```bash
eb create math-phoenix-prod --instance-type t3.small
```

#### 1.4 Configure Environment Variables
```bash
eb setenv \
  NODE_ENV=production \
  OPENAI_API_KEY=your_openai_key \
  AWS_REGION=us-east-1 \
  SESSION_SECRET=your_session_secret \
  DASHBOARD_PASSWORD=your_dashboard_password \
  S3_BUCKET_NAME=your_s3_bucket \
  DYNAMODB_TABLE_NAME=math-phoenix-sessions \
  DYNAMODB_ML_TABLE_NAME=math-phoenix-ml-data
```

#### 1.5 Deploy
```bash
eb deploy
```

#### 1.6 Get Backend URL
```bash
eb status
# Note the CNAME (e.g., math-phoenix-prod.us-east-1.elasticbeanstalk.com)
```

### Step 2: Deploy Frontend to S3 + CloudFront

#### 2.1 Build Frontend
```bash
cd frontend
VITE_API_URL=https://your-backend-url.elasticbeanstalk.com npm run build
```

#### 2.2 Create S3 Bucket for Frontend
```bash
aws s3 mb s3://math-phoenix-frontend --region us-east-1
```

#### 2.3 Configure S3 for Static Website Hosting
```bash
aws s3 website s3://math-phoenix-frontend \
  --index-document index.html \
  --error-document index.html
```

#### 2.4 Upload Build Files
```bash
aws s3 sync dist/ s3://math-phoenix-frontend --delete
```

#### 2.5 Create CloudFront Distribution
```bash
aws cloudfront create-distribution \
  --origin-domain-name math-phoenix-frontend.s3.amazonaws.com \
  --default-root-object index.html
```

#### 2.6 Update Backend CORS
Update your backend environment variables to include the CloudFront URL:
```bash
eb setenv CLOUDFRONT_URL=https://your-cloudfront-id.cloudfront.net
```

### Step 3: Configure Custom Domain (Optional)

#### 3.1 Add Domain to CloudFront
- Go to CloudFront console
- Edit distribution
- Add alternate domain name (CNAME)
- Request/upload SSL certificate via ACM

#### 3.2 Update DNS
- Add CNAME record pointing to CloudFront distribution
- Add A/AAAA records for backend (via Route 53 or your DNS provider)

---

## 🚀 Option 2: Vercel + Railway (Easiest)

### Step 1: Deploy Backend to Railway

#### 1.1 Install Railway CLI
```bash
npm install -g @railway/cli
```

#### 1.2 Login and Initialize
```bash
railway login
cd backend
railway init
```

#### 1.3 Add Environment Variables
Go to Railway dashboard and add:
- `NODE_ENV=production`
- `OPENAI_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `SESSION_SECRET`
- `DASHBOARD_PASSWORD`
- `S3_BUCKET_NAME`
- `DYNAMODB_TABLE_NAME`
- `DYNAMODB_ML_TABLE_NAME`

#### 1.4 Deploy
```bash
railway up
```

#### 1.5 Get Backend URL
```bash
railway domain
# Note the URL (e.g., math-phoenix-backend.up.railway.app)
```

### Step 2: Deploy Frontend to Vercel

#### 2.1 Install Vercel CLI
```bash
npm install -g vercel
```

#### 2.2 Deploy
```bash
cd frontend
vercel
```

#### 2.3 Add Environment Variable
In Vercel dashboard, add:
- `VITE_API_URL=https://your-backend.up.railway.app`

#### 2.4 Redeploy
```bash
vercel --prod
```

---

## 🚀 Option 3: Render (All-in-One)

### Step 1: Deploy Backend

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: math-phoenix-backend
   - **Root Directory**: backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Starter ($7/month) or Free

5. Add Environment Variables (same as Railway above)

6. Click "Create Web Service"

7. Note the backend URL (e.g., https://math-phoenix-backend.onrender.com)

### Step 2: Deploy Frontend

1. Click "New +" → "Static Site"
2. Connect your GitHub repository
3. Configure:
   - **Name**: math-phoenix-frontend
   - **Root Directory**: frontend
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: dist

4. Add Environment Variable:
   - `VITE_API_URL=https://your-backend.onrender.com`

5. Click "Create Static Site"

---

## 🔧 Post-Deployment Configuration

### 1. Update Backend CORS
Ensure your backend allows requests from your frontend domain:
- Add frontend URL to `FRONTEND_URL` or `CLOUDFRONT_URL` environment variable
- Backend already has CORS configured to accept these

### 2. Test the Deployment

#### Health Check
```bash
curl https://your-backend-url/health
```

#### Create Session
```bash
curl -X POST https://your-backend-url/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"school_code": "TEST123"}'
```

### 3. Monitor Logs

#### AWS Elastic Beanstalk
```bash
eb logs
```

#### Railway
```bash
railway logs
```

#### Render
- View logs in Render dashboard

### 4. Set Up Monitoring (Optional)

#### AWS CloudWatch
- Automatically enabled for Elastic Beanstalk
- Set up alarms for errors, latency, etc.

#### External Monitoring
- [UptimeRobot](https://uptimerobot.com/) - Free uptime monitoring
- [Sentry](https://sentry.io/) - Error tracking
- [LogRocket](https://logrocket.com/) - Session replay

---

## 💰 Cost Estimates

### AWS (Option 1)
- **Elastic Beanstalk**: ~$15-30/month (t3.small)
- **S3 + CloudFront**: ~$1-5/month (depending on traffic)
- **DynamoDB**: ~$1-10/month (on-demand pricing)
- **Total**: ~$17-45/month

### Vercel + Railway (Option 2)
- **Railway**: $5-20/month (depending on usage)
- **Vercel**: Free (Hobby) or $20/month (Pro)
- **AWS Services** (S3, DynamoDB): ~$1-10/month
- **Total**: ~$6-50/month

### Render (Option 3)
- **Backend**: Free or $7/month (Starter)
- **Frontend**: Free
- **AWS Services** (S3, DynamoDB): ~$1-10/month
- **Total**: ~$1-17/month

---

## 🔐 Security Checklist

- [ ] Use environment variables for all secrets (never commit `.env`)
- [ ] Enable HTTPS/SSL for both frontend and backend
- [ ] Set strong `DASHBOARD_PASSWORD`
- [ ] Use IAM roles instead of access keys when possible (AWS)
- [ ] Enable AWS CloudTrail for audit logging
- [ ] Set up rate limiting (see Phase 3 in tasks.md)
- [ ] Configure CORS properly (only allow your frontend domain)
- [ ] Enable DynamoDB encryption at rest
- [ ] Use S3 bucket policies to restrict access
- [ ] Regularly rotate secrets and API keys

---

## 🔄 Continuous Deployment (CI/CD)

### GitHub Actions (Recommended)

See `.github/workflows/deploy.yml` for automated deployment on push to `main` branch.

### Manual Deployment

#### AWS
```bash
cd backend && eb deploy
cd frontend && npm run build && aws s3 sync dist/ s3://math-phoenix-frontend
```

#### Railway
```bash
cd backend && railway up
```

#### Vercel
```bash
cd frontend && vercel --prod
```

---

## 🐛 Troubleshooting

### Backend Issues

#### "Cannot connect to DynamoDB"
- Check AWS credentials are set correctly
- Verify IAM permissions for DynamoDB access
- Ensure `AWS_REGION` matches your DynamoDB table region

#### "OpenAI API error"
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI account has sufficient credits
- Ensure API key has access to GPT-4 and Vision API

#### "CORS error"
- Add frontend URL to backend CORS configuration
- Check `FRONTEND_URL` or `CLOUDFRONT_URL` environment variable

### Frontend Issues

#### "API calls failing"
- Verify `VITE_API_URL` is set correctly during build
- Check backend is running and accessible
- Inspect browser console for CORS errors

#### "Blank page after deployment"
- Check browser console for errors
- Verify build completed successfully
- Ensure `index.html` is in the root of the deployment

---

## 📚 Additional Resources

- [AWS Elastic Beanstalk Documentation](https://docs.aws.amazon.com/elasticbeanstalk/)
- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)

---

## 🆘 Support

If you encounter issues during deployment:
1. Check the logs (see "Monitor Logs" section above)
2. Review the troubleshooting section
3. Ensure all environment variables are set correctly
4. Verify AWS resources are created and accessible

---

## 📝 Next Steps After Deployment

1. **Test thoroughly**: Create sessions, submit problems, test chat
2. **Set up monitoring**: Configure alerts for errors and downtime
3. **Share the URL**: Give users access to your frontend URL
4. **Gather feedback**: Monitor usage and iterate
5. **Scale as needed**: Upgrade instances/plans based on traffic

---

**Congratulations!** 🎉 Your Math Phoenix application is now live and accessible to others!

