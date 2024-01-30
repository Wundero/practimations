# Practimations

Estimations for the soul.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FWundero%2Fpractimations&env=DATABASE_URL,PUSHER_APP_ID,PUSHER_KEY,PUSHER_SECRET,PUSHER_CLUSTER,NEXTAUTH_SECRET,NEXT_PUBLIC_PUSHER_KEY,NEXT_PUBLIC_PUSHER_CLUSTER,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET&envDescription=Additional%20environment%20variables%20are%20specified%20in%20the%20example%20env%20file&envLink=https%3A%2F%2Fgithub.com%2FWundero%2Fpractimations%2Fblob%2Fmain%2F.env.example&project-name=practimations&repository-name=practimations)

## Running it yourself
The app needs a MySQL database and a Pusher app setup and put into the environment. See the `.env.example` file for a list of all variables needed to run the app. Additionally, at least one of the given OAuth providers must be provided.

Steps:
1. Create a database on [PlanetScale](https://planetscale.com/) (MySQL databases will work but this is easiest)
2. Select `Prisma` from the connection options
3. Copy the database URL into the `.env` file
4. Create an app on [Pusher](https://pusher.com/) or [Soketi](https://soketi.app/)
5. Copy the relevant variables into the `.env` file
6. Create an OAuth app and copy the client ID and client secret into the `.env`
- Note: To support importing/exporting, one of Atlassian, Notion and Linear is needed based on what source you want.
1. Install dependencies with `npm install`
2. Push the settings to the database with `npx prisma db push`
3. Run locally with `npm run dev`
4.  When you are ready, fork the repo and deploy it on your deployment platform of choice.
