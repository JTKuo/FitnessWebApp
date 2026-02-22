import os
import re

def get_requirements():
    req_file = 'requirements.txt'
    if not os.path.exists(req_file):
        return []
    with open(req_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    packages = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith('#'):
            # Simple parsing for package names
            pkg = re.split('[<>=]', line)[0].strip()
            packages.append(pkg)
    return packages

def update_readme(packages):
    readme_file = 'README.md'
    if not os.path.exists(readme_file):
        print("README.md not found.")
        return

    with open(readme_file, 'r', encoding='utf-8') as f:
        content = f.read()

    tech_section = "## 🔧 核心技術\n<!-- TECH_START -->\n"
    for pkg in packages:
        # Map some common packages to descriptions
        descriptions = {
            'fastapi': '現代、高效的 Web 框架。',
            'uvicorn': 'ASGI 伺服器。',
            'pandas': '資料處理。',
            'requests': 'HTTP 請求。',
            'pydantic': '資料驗證。',
            'sqlalchemy': '資料庫 ORM。'
        }
        desc = descriptions.get(pkg.lower(), '專案依賴。')
        tech_section += f"- **{pkg.capitalize()}**: {desc}\n"
    tech_section += "<!-- TECH_END -->"

    pattern = r"## 🔧 核心技術\n<!-- TECH_START -->.*?<!-- TECH_END -->"
    new_content = re.sub(pattern, tech_section, content, flags=re.DOTALL)

    with open(readme_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("README.md updated successfully.")

if __name__ == "__main__":
    pkgs = get_requirements()
    update_readme(pkgs)
