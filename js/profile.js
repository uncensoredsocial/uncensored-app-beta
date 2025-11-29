<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile - Uncensored Social</title>
    <link rel="stylesheet" href="css/styles.css">
    <link rel="stylesheet" href="css/profile-styles.css">
    <link rel="stylesheet" href="css/icons.css">
</head>
<body>
    <!-- Top Header -->
    <header class="header">
        <div class="header-left">
            <!-- left side intentionally empty so title stays centered -->
        </div>

        <h1 class="page-title">Profile</h1>

        <div class="header-actions">
            <!-- Settings button -->
            <button class="btn btn-ghost btn-icon" id="settingsButton" title="Settings">
                <span class="icon icon-settings"></span>
            </button>
        </div>
    </header>

    <!-- Main Content Area -->
    <div class="content-wrapper">
        <main class="main-content">
            <!-- Profile Header (banner + avatar + basic info) -->
            <section class="profile-header">
                <div class="profile-banner">
                    <!-- banner image can be updated by JS -->
                    <img id="profileBanner" src="assets/gradients/profile-banner.svg" alt="Profile banner">
                </div>

                <div class="profile-info">
                    <div class="profile-avatar-section">
                        <img
                            id="profileAvatar"
                            class="profile-avatar"
                            src="assets/icons/default-profile.png"
                            alt="Profile picture"
                        />

                        <div class="profile-actions">
                            <button id="editProfileBtn" class="btn btn-primary btn-pill">
                                Edit Profile
                            </button>
                        </div>
                    </div>

                    <div class="profile-details">
                        <div class="profile-display-name" id="profileName">Loading...</div>
                        <div class="profile-username" id="profileUsername">@username</div>
                        <p class="profile-bio" id="profileBio">Loading bio...</p>

                        <div class="profile-meta">
                            <span id="joinDate">Joined —</span>
                        </div>

                        <div class="profile-stats">
                            <div class="stat">
                                <strong id="postsCount">0</strong>
                                <span>Posts</span>
                            </div>
                            <div class="stat">
                                <strong id="followersCount">0</strong>
                                <span>Followers</span>
                            </div>
                            <div class="stat">
                                <strong id="followingCount">0</strong>
                                <span>Following</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Tabs -->
            <nav class="profile-tabs">
                <button class="tab-btn active" data-tab="posts">Posts</button>
                <button class="tab-btn" data-tab="likes">Likes</button>
            </nav>

            <!-- Tab Content -->
            <section class="tab-content">
                <!-- Posts tab -->
                <div class="tab-pane active" id="postsTab">
                    <div id="profilePosts" class="posts-container">
                        <div class="loading-indicator">
                            <div class="loading-spinner"></div>
                            <span>Loading posts...</span>
                        </div>
                    </div>
                </div>

                <!-- Likes tab -->
                <div class="tab-pane" id="likesTab">
                    <div id="likedPosts" class="posts-container">
                        <p class="empty-state">
                            No liked posts yet
                        </p>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <!-- Bottom Navigation - Mobile -->
    <nav class="bottom-nav" id="bottomNav">
        <a href="index.html" class="nav-item">
            <span class="icon icon-home"></span>
            <span class="nav-label">Home</span>
        </a>
        <a href="search.html" class="nav-item">
            <span class="icon icon-search"></span>
            <span class="nav-label">Search</span>
        </a>
        <a href="notifications.html" class="nav-item">
            <span class="icon icon-notifications"></span>
            <span class="nav-label">Alerts</span>
        </a>
        <a href="dms.html" class="nav-item">
            <span class="icon icon-messages"></span>
            <span class="nav-label">Messages</span>
        </a>
    </nav>

    <!-- Sidebar Menu (same as index.html so layout matches) -->
    <div class="sidebar" id="sidebar">
        <div class="sidebar-content">
            <div class="sidebar-header">
                <h3>Menu</h3>
                <button class="btn btn-ghost btn-icon" id="closeSidebar">
                    <span class="icon icon-close"></span>
                </button>
            </div>

            <div class="sidebar-user">
                <img src="assets/icons/default-profile.png" alt="Profile" id="sidebarProfileImg">
                <div class="sidebar-user-info">
                    <h4 id="sidebarUserName">Username</h4>
                    <p id="sidebarUserHandle">@username</p>
                </div>
            </div>

            <ul class="menu-items">
                <li>
                    <a href="profile.html?user=me">
                        <span class="icon icon-profile"></span>
                        <span>My Profile</span>
                    </a>
                </li>
                <li>
                    <a href="saved.html">
                        <span class="icon icon-saved"></span>
                        <span>Saved Posts</span>
                    </a>
                </li>
                <li>
                    <a href="settings.html">
                        <span class="icon icon-settings"></span>
                        <span>Settings</span>
                    </a>
                </li>
                <li>
                    <a href="#" onclick="logout()">
                        <span class="icon icon-logout"></span>
                        <span>Logout</span>
                    </a>
                </li>
            </ul>
        </div>
    </div>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>

    <!-- Edit Profile Modal -->
    <div class="modal" id="editProfileModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Profile</h3>
                <button class="close-modal" id="closeEditModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="editProfileForm">
                    <div class="field-group">
                        <label for="editDisplayName" class="field-label">Display name</label>
                        <input
                            type="text"
                            id="editDisplayName"
                            class="field-input"
                            maxlength="50"
                            placeholder="Your name"
                        />
                    </div>

                    <div class="field-group">
                        <label for="editBio" class="field-label">Bio</label>
                        <textarea
                            id="editBio"
                            class="field-input"
                            rows="3"
                            maxlength="160"
                            placeholder="Tell people about yourself"
                        ></textarea>
                        <div class="char-counter" id="bioCharCounter">0/160</div>
                    </div>

                    <div class="field-group">
                        <label for="editAvatarUrl" class="field-label">Avatar URL</label>
                        <input
                            type="url"
                            id="editAvatarUrl"
                            class="field-input"
                            placeholder="https://example.com/avatar.png"
                        />
                    </div>

                    <div class="field-group">
                        <label for="editBannerUrl" class="field-label">Banner URL</label>
                        <input
                            type="url"
                            id="editBannerUrl"
                            class="field-input"
                            placeholder="https://example.com/banner.jpg"
                        />
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="cancelEditBtn">
                    Cancel
                </button>
                <button type="button" class="btn btn-primary" id="saveProfileBtn">
                    Save
                </button>
            </div>
        </div>
    </div>

    <script src="js/auth.js"></script>
    <script src="js/profile.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
