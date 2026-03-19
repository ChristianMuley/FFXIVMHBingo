var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// Serve index.html by default
app.UseDefaultFiles();

// Serve files from wwwroot (html, css, js, images, json, etc.)
app.UseStaticFiles();

app.Run();