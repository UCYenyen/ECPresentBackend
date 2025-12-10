import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");
  const Learning = await prisma.learning.createMany({
    data: [
      {
        title: "Roadmap to presentation success",
        description:
          "Key questions to ask before writing, identifying key messages, and building the story/communication flow.",
        video_url: "https://www.youtube.com/watch?v=W7GPV0K6iEY",
        status: "ONPROGRESS",
      },
      {
        title: "Discover the Roadmap to Engaging PowerPoint Presentations",
        description:
          'How to use a visual "roadmap" instead of a basic table of contents to captivate your audience and indicate progress.',
        video_url: "https://www.youtube.com/watch?v=PKkPI8oayjk",
      },
      {
        title: "PowerPoint Roadmap & Structure for a Successful Presentation",
        description:
          "Tailoring your approach to different presentation types and the vital importance of starting strong.",
        video_url: "https://www.youtube.com/watch?v=LCe4ROjIKH4",
      },
      {
        title:
          "PowerPoint Slide Makeover using Effective Visuals (3 Steps to Design)",
        description:
          "Practical, step-by-step example of how to makeover a financial planning slide using effective visuals, clear design, and simple animation.",
        video_url: "https://www.youtube.com/watch?v=-wR-kWqRyr8",
      },
      {
        title:
          "How To Create Professional Microsoft PowerPoint Presentation Slides",
        description:
          "PowerPoint Slide Design from Beginner to EXPERT in One Video",
        video_url: "https://www.youtube.com/watch?v=44zBpZHVMAk",
      },
      {
        title: "PowerPoint Slide Design from Beginner to EXPERT in One Video",
        description:
          "Focus: A comprehensive tutorial covering various slide design secrets, infographics, and animation techniques for in-depth learning.",
        video_url: "https://www.youtube.com/watch?v=lxcHLxjkcXQ",
      },
      {
        title: "Public Speaking For Beginners",
        description:
          "A great starting point for beginners, covering immediate do's and don'ts, confident posture, eye contact, and reducing reliance on notes.",
        video_url: "https://www.youtube.com/watch?v=i5mYphUoOCs",
      },
      {
        title: "Make Body Language Your Superpower",
        description:
          "An in-depth look at how to use your nonverbal communication effectively, including reading and responding to the audience's body language (e.g., when they look bored).",
        video_url: "https://www.youtube.com/watch?v=cFLjudWTuGQ",
      },
      {
        title: "Present With Confidence: Use Your Body Language & Voice To Make A Big Impact",
        description:
          "Detailed, practical tips on combining verbal and non-verbal delivery skills, specifically focusing on posture, gestures, facial expressions, and vocal variety.",
        video_url: "https://www.youtube.com/watch?v=4wiJpm43pGs",
      },
    ],
  });
  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
